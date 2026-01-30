<script setup lang="ts">
import { inject, onMounted, onUnmounted, shallowRef, watch, Ref } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { IGameNode } from '../../types/schema'
import { calibrateWheel } from '../../utils/wheelUtils'
import type RAPIER_TYPE from '@dimforge/rapier3d-compat'

const props = defineProps<{
  node: IGameNode
  object3d: THREE.Object3D
}>()

const emit = defineEmits(['created'])

const worldRef = inject<shallowRef<RAPIER_TYPE.World | null>>('physics-world')
const RAPIER = inject<typeof RAPIER_TYPE>('rapier-instance')!
const parentBodyRef = inject<Ref<RAPIER_TYPE.RigidBody | null>>('parent-body-ref', shallowRef(null))
const preStepSystem = inject<{ register: (cb: any) => void, unregister: (cb: any) => void }>('physics-pre-step')
const registry = inject<{
  register: (h: number, n: string) => void,
  unregister: (h: number) => void
}>('collision-registry')

let rigidBody: RAPIER_TYPE.RigidBody | null = null
let collider: RAPIER_TYPE.Collider | null = null
let characterController: RAPIER_TYPE.KinematicCharacterController | null = null
let vehicleController: RAPIER_TYPE.DynamicRayCastVehicleController | null = null

// 记录分离的轮子，方便销毁时还原
const detachedWheels: { object: THREE.Object3D, originalParent: THREE.Object3D | null }[] = []

// --- 辅助函数 ---
const findMesh = (obj: THREE.Object3D): THREE.Mesh | null => {
  if (obj.type === 'Mesh') return obj as THREE.Mesh
  for (const child of obj.children) {
    const found = findMesh(child)
    if (found) return found
  }
  return null
}

// --- 1. attachCollider ---
const attachCollider = (targetBody: RAPIER_TYPE.RigidBody, isChild: boolean) => {
  if (!worldRef || !worldRef.value) return

  const isWheel = props.node.components.some(c => c.type === 'VehicleWheel')
  if (isWheel) return 

  const meshProps = props.node.components.find(c => c.type === 'Mesh')?.props
  const rbProps = props.node.components.find(c => c.type === 'RigidBody')?.props
  
  if (!meshProps) return

  let colliderDesc: RAPIER_TYPE.ColliderDesc | null = null
  const colliderType = rbProps?.colliderType || 'primitive'
  
  const scale = new THREE.Vector3()
  props.object3d.updateWorldMatrix(true, false)
  props.object3d.getWorldScale(scale)

  const isNonUniformSphere = meshProps.geometry === 'Sphere' && (
    Math.abs(scale.x - scale.y) > 0.001 || 
    Math.abs(scale.y - scale.z) > 0.001 ||
    Math.abs(scale.x - scale.z) > 0.001
  )

  const shouldUseMesh = colliderType === 'hull' || colliderType === 'trimesh' || isNonUniformSphere
  
  if (shouldUseMesh) {
    const mesh = findMesh(props.object3d)
    if (mesh && mesh.geometry) {
      const geometry = mesh.geometry
      const posAttr = geometry.attributes.position
      const vertices = new Float32Array(posAttr.count * 3)
      for (let i = 0; i < posAttr.count; i++) {
        vertices[i * 3 + 0] = posAttr.getX(i) * scale.x
        vertices[i * 3 + 1] = posAttr.getY(i) * scale.y
        vertices[i * 3 + 2] = posAttr.getZ(i) * scale.z
      }
      if (colliderType === 'hull' || isNonUniformSphere) {
        colliderDesc = RAPIER.ColliderDesc.convexHull(vertices)
      } else if (geometry.index) {
        const indices = new Uint32Array(geometry.index.array)
        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      }
    }
  } 

  if (!colliderDesc) {
    const args = meshProps.args || []
    switch (meshProps.geometry) {
      case 'Box':
        colliderDesc = RAPIER.ColliderDesc.cuboid((args[0]??1)*scale.x/2, (args[1]??1)*scale.y/2, (args[2]??1)*scale.z/2)
        break
      case 'Sphere':
        colliderDesc = RAPIER.ColliderDesc.ball((args[0]??1)*Math.max(scale.x, scale.y, scale.z))
        break
      case 'Plane':
        colliderDesc = RAPIER.ColliderDesc.cuboid((args[0]??1)*scale.x/2, (args[1]??1)*scale.y/2, 0.005*scale.z)
        break
    }
  }

  if (!colliderDesc) return

  if (rbProps) {
    colliderDesc.setRestitution(rbProps.restitution ?? 0.5)
    colliderDesc.setFriction(rbProps.friction ?? 0.5)
    if (!isChild && rbProps.mass) {
       colliderDesc.setMass(rbProps.mass)
    }
  }

  if (isChild) {
    props.object3d.updateWorldMatrix(true, false)
    const myPos = new THREE.Vector3(); props.object3d.getWorldPosition(myPos)
    const myQuat = new THREE.Quaternion(); props.object3d.getWorldQuaternion(myQuat)
    const bPos = targetBody.translation()
    const bRot = targetBody.rotation()
    const parentMat = new THREE.Matrix4().compose(new THREE.Vector3(bPos.x,bPos.y,bPos.z), new THREE.Quaternion(bRot.x,bRot.y,bRot.z,bRot.w), new THREE.Vector3(1,1,1))
    const childMat = new THREE.Matrix4().compose(myPos, myQuat, new THREE.Vector3(1,1,1))
    const relMat = parentMat.invert().multiply(childMat)
    const relPos = new THREE.Vector3(); const relQuat = new THREE.Quaternion()
    relMat.decompose(relPos, relQuat, new THREE.Vector3())
    colliderDesc.setTranslation(relPos.x, relPos.y, relPos.z)
    colliderDesc.setRotation(relQuat)
  }

  colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)

  collider = worldRef.value.createCollider(colliderDesc, targetBody)

  // 注册 ID 映射
  if (collider && registry) {
    registry.register(collider.handle, props.node.id)
  }
}

// --- 2. Setup Vehicle ---
const setupVehicle = (body: RAPIER_TYPE.RigidBody) => {
  const chassisComp = props.node.components.find(c => c.type === 'VehicleChassis')
  if (!chassisComp || !worldRef?.value) return

  console.log(`[Physics] 🚗 Init Vehicle: ${props.node.name}`) 

  const offset = chassisComp.props.centerOfMassOffset
  if (offset && (offset[0] !== 0 || offset[1] !== 0 || offset[2] !== 0)) {
     const bodyMass = body.mass()
     body.setAdditionalMassProperties(
        bodyMass * 0.5, 
        { x: offset[0], y: offset[1], z: offset[2] }, 
        { x: 0, y: 0, z: 0 }, 
        { x: 0, y: 0, z: 0, w: 1 }
     )
     body.wakeUp()
  }

  vehicleController = worldRef.value.createVehicleController(body)
  const vehicleData = { controller: vehicleController, wheels: [] as any[] }
  
  const worldRoot = props.object3d.parent || props.object3d

  props.node.children?.forEach((childNode) => {
    const wheelComp = childNode.components.find(c => c.type === 'VehicleWheel')
    if (!wheelComp) return

    let wheelObject: THREE.Object3D | null = null
    props.object3d.traverse((obj) => {
      if (obj.userData.id === childNode.id) wheelObject = obj
    })
    
    if (!wheelObject) return

    const innerMesh = findMesh(wheelObject)
    if (!innerMesh) return

    const calibration = calibrateWheel(innerMesh, props.object3d)
    if (!calibration) return

    const { radius, axle, direction, connectionPoint } = calibration
    const config = wheelComp.props
    const finalRadius = radius * (config.radiusScale || 1.0)

    // 分离轮子 (解决椭圆问题)
    const originalParent = wheelObject.parent
    if (originalParent) {
      worldRoot.attach(wheelObject) 
      detachedWheels.push({ object: wheelObject, originalParent })
    }

    vehicleController!.addWheel(
      connectionPoint, direction, axle, 
      config.suspensionRestLength ?? 0.3, finalRadius
    )
    
    const index = vehicleController!.numWheels() - 1
    
    vehicleController!.setWheelSuspensionStiffness(index, config.suspensionStiffness ?? 100)
    vehicleController!.setWheelSuspensionCompression(index, 10.0)
    vehicleController!.setWheelSuspensionRelaxation(index, 6.0)
    vehicleController!.setWheelMaxSuspensionTravel(index, config.maxSuspensionTravel ?? 0.2)
    vehicleController!.setWheelSideFrictionStiffness(index, 1.5) 

    vehicleData.wheels.push({
      index,
      nodeId: childNode.id,
      object: wheelObject, 
      isDrive: config.isDrive,
      isSteering: config.isSteering,
      brakeForce: config.brakeForce ?? 1.0,
      currentSteering: 0,
      connectionPoint: connectionPoint.clone(),
      direction: direction.clone(),
      // 🟢 记录半径，用于视觉修正
      radius: finalRadius 
    })
  })

  props.object3d.userData.vehicle = vehicleData
}

const updateVehiclePhysics = () => {
  if (vehicleController && worldRef?.value) {
    try {
      vehicleController.updateVehicle(worldRef.value.timestep)
    } catch (e) {}
  }
}

// --- 3. Init ---
const initPhysics = () => {
  const world = worldRef?.value
  if (!world || !props.object3d) return

  const rbProps = props.node.components.find(c => c.type === 'RigidBody')?.props

  if (rbProps) {
    let bodyDesc: RAPIER_TYPE.RigidBodyDesc
    const type = rbProps.bodyType || 'dynamic'
    switch (type) {
      case 'fixed': bodyDesc = RAPIER.RigidBodyDesc.fixed(); break;
      case 'kinematicPositionBased': bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased(); break;
      case 'dynamic': default: bodyDesc = RAPIER.RigidBodyDesc.dynamic(); break;
    }
    bodyDesc.setLinearDamping(rbProps.linearDamping ?? 0)
    bodyDesc.setAngularDamping(rbProps.angularDamping ?? 0)

    props.object3d.updateWorldMatrix(true, false)
    const worldPos = new THREE.Vector3(); props.object3d.getWorldPosition(worldPos)
    const worldRot = new THREE.Quaternion(); props.object3d.getWorldQuaternion(worldRot)
    
    bodyDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z)
    bodyDesc.setRotation({ x: worldRot.x, y: worldRot.y, z: worldRot.z, w: worldRot.w })

    rigidBody = world.createRigidBody(bodyDesc)
    rigidBody.enableCcd(true)
    props.object3d.userData.physicsBody = rigidBody
    
    emit('created', rigidBody)
    attachCollider(rigidBody, false) 

    setupVehicle(rigidBody)
    
    if (vehicleController && preStepSystem) {
      preStepSystem.register(updateVehiclePhysics)
    }

    if (type === 'kinematicPositionBased') {
      characterController = world.createCharacterController(0.0)
      characterController.setMaxSlopeClimbAngle(45 * (Math.PI / 180))
      characterController.enableAutostep(0.3, 0.1, true)
      characterController.enableSnapToGround(0.2)
      props.object3d.userData.characterController = characterController
    }
  } 
  else if (parentBodyRef && parentBodyRef.value) {
    attachCollider(parentBodyRef.value, true)
    watch(parentBodyRef, (pBody) => {
      if (pBody && !collider) attachCollider(pBody, true)
    })
  }
  else {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
    props.object3d.updateWorldMatrix(true, false)
    const worldPos = new THREE.Vector3(); props.object3d.getWorldPosition(worldPos)
    const worldRot = new THREE.Quaternion(); props.object3d.getWorldQuaternion(worldRot)
    bodyDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z)
    bodyDesc.setRotation({ x: worldRot.x, y: worldRot.y, z: worldRot.z, w: worldRot.w })
    rigidBody = world.createRigidBody(bodyDesc)
    attachCollider(rigidBody, false)
  }
}

// --- Render Loop ---
const { onBeforeRender } = useLoop()
const _tempPos = new THREE.Vector3()
const _tempAxisY = new THREE.Vector3(0, 1, 0) 
const _tempAxisX = new THREE.Vector3(1, 0, 0) 
const _chassisPos = new THREE.Vector3()
const _chassisQuat = new THREE.Quaternion()
const _wheelLocalPos = new THREE.Vector3()
const _wheelLocalQuat = new THREE.Quaternion()

// 🟢 定义一个视觉地面高度 (基于你的地面模型 Scale.Y=0.2 => 表面高度 0.1)
// 如果你有更复杂的地形，这里需要用 Raycast 检测
const VISUAL_GROUND_LEVEL = 0.1; 

onBeforeRender(() => {
  const world = worldRef?.value
  if (!world) return

  if (rigidBody) {
    const t = rigidBody.translation()
    const r = rigidBody.rotation()
    _chassisPos.set(t.x, t.y, t.z)
    _chassisQuat.set(r.x, r.y, r.z, r.w)
  }

  if (vehicleController && props.object3d.userData.vehicle) {
    try {
      const wheelsMeta = props.object3d.userData.vehicle.wheels
      
      for (let i = 0; i < vehicleController.numWheels(); i++) {
        const meta = wheelsMeta[i]
        if (!meta || !meta.object) continue

        // A. 计算位置
        const connection = meta.connectionPoint
        const dir = meta.direction
        const suspensionLen = vehicleController.wheelSuspensionLength(i) || 0

        _wheelLocalPos.copy(connection).addScaledVector(dir, suspensionLen)

        // B. 计算旋转
        const steeringAngle = (meta.currentSteering !== undefined) 
           ? meta.currentSteering 
           : (vehicleController.wheelSteering(i) || 0)
        const rotationAngle = vehicleController.wheelRotation(i) || 0

        const qSteer = new THREE.Quaternion().setFromAxisAngle(_tempAxisY, steeringAngle)
        const qRotate = new THREE.Quaternion().setFromAxisAngle(_tempAxisX, rotationAngle)
        _wheelLocalQuat.copy(qSteer).multiply(qRotate)

        // C. 转世界坐标
        _tempPos.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos)
        meta.object.position.copy(_tempPos)
        meta.object.quaternion.copy(_chassisQuat).multiply(_wheelLocalQuat)

        // 🟢 核心修复：防止视觉穿模
        // 如果轮子底部掉到了地面以下，强制把它提上来
        // 这样会产生“悬挂还有行程”的视觉错觉，即便物理上已经触底了
        if (meta.radius) {
           const bottomY = meta.object.position.y - meta.radius
           if (bottomY < VISUAL_GROUND_LEVEL) {
              meta.object.position.y = VISUAL_GROUND_LEVEL + meta.radius
           }
        }
      }
    } catch (e) {}
  }

  if (rigidBody && props.object3d) {
    const type = rigidBody.bodyType()
    if (type === RAPIER.RigidBodyType.Dynamic) {
       props.object3d.position.copy(_chassisPos)
       props.object3d.quaternion.copy(_chassisQuat)
    } 
    else if (type === RAPIER.RigidBodyType.KinematicPositionBased) {
      rigidBody.setNextKinematicTranslation(props.object3d.position)
      rigidBody.setNextKinematicRotation(props.object3d.quaternion)
    }
  }
})

onMounted(() => {
  setTimeout(initPhysics, 50)
})

onUnmounted(() => {
  if (preStepSystem) {
    preStepSystem.unregister(updateVehiclePhysics)
  }
  
  detachedWheels.forEach(({ object, originalParent }) => {
    if (originalParent) originalParent.attach(object)
  })
  
  if (vehicleController) {
    vehicleController.free()
    vehicleController = null
  }
  if (characterController) {
    characterController.free()
    characterController = null
  }
  if (worldRef?.value && rigidBody) {
    worldRef.value.removeRigidBody(rigidBody)
  }
  if (props.object3d) {
    props.object3d.userData.physicsBody = null
    props.object3d.userData.characterController = null
    props.object3d.userData.vehicle = null
  }

  if (collider && registry) {
    registry.unregister(collider.handle)
  }
})
</script>

<template></template>