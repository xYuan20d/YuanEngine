<script setup lang="ts">
import { inject, onMounted, onUnmounted, shallowRef } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { IGameNode } from '../../types/schema'
import { calibrateWheel } from '../../utils/wheelUtils'
import { flattenProps } from '../../utils/props'
import type RAPIER_TYPE from '@dimforge/rapier3d-compat'

const props = defineProps<{
  node: IGameNode
  object3d: THREE.Object3D
}>()

const emit = defineEmits(['created'])

const worldRef = inject<shallowRef<RAPIER_TYPE.World | null>>('physics-world')
const RAPIER = inject<typeof RAPIER_TYPE>('rapier-instance')!
const registry = inject<{
  register: (h: number, n: string) => void,
  unregister: (h: number) => void
}>('collision-registry')
const preStepSystem = inject<{ register: (cb: any) => void, unregister: (cb: any) => void }>('physics-pre-step')

let rigidBody: RAPIER_TYPE.RigidBody | null = null
let colliders: RAPIER_TYPE.Collider[] = [] 
let vehicleController: RAPIER_TYPE.DynamicRayCastVehicleController | null = null
let characterController: RAPIER_TYPE.KinematicCharacterController | null = null
const detachedWheels: { object: THREE.Object3D, originalParent: THREE.Object3D | null }[] = []


const createConvexHullFromMesh = (mesh: THREE.Mesh, scale: THREE.Vector3): Float32Array | null => {
  const geometry = mesh.geometry
  if (!geometry) return null
  
  const vertices: number[] = []
  const posAttr = geometry.attributes.position
  
  for (let i = 0; i < posAttr.count; i++) {
    // 🟢 关键修正：将提取的顶点乘以缩放系数
    vertices.push(
      posAttr.getX(i) * scale.x, 
      posAttr.getY(i) * scale.y, 
      posAttr.getZ(i) * scale.z
    )
  }
  
  return new Float32Array(vertices)
}

const createTrimeshFromMesh = (mesh: THREE.Mesh, scale: THREE.Vector3): { vertices: Float32Array, indices: Uint32Array } | null => {
  const geometry = mesh.geometry
  if (!geometry) return null
  
  const posAttr = geometry.attributes.position
  const indexAttr = geometry.index
  
  // 🟢 关键修正：手动处理顶点缩放
  const vertexCount = posAttr.count
  const vertices = new Float32Array(vertexCount * 3)
  
  for (let i = 0; i < vertexCount; i++) {
    vertices[i * 3 + 0] = posAttr.getX(i) * scale.x
    vertices[i * 3 + 1] = posAttr.getY(i) * scale.y
    vertices[i * 3 + 2] = posAttr.getZ(i) * scale.z
  }

  let indices: Uint32Array
  if (indexAttr) {
    indices = new Uint32Array(indexAttr.array)
  } else {
    const arr = []
    for (let i = 0; i < posAttr.count; i++) arr.push(i)
    indices = new Uint32Array(arr)
  }
  
  return { vertices, indices }
}

// --- 🟢 修复 1: 辅助函数 - 必须应用缩放 ---

// 将 Mesh 的几何体顶点数据，变换到 RigidBody 的坐标系下（包含缩放）
const getScaledVertices = (mesh: THREE.Mesh, scale: THREE.Vector3): Float32Array | null => {
  const geometry = mesh.geometry
  if (!geometry) return null
  
  const posAttr = geometry.attributes.position
  const vertices: number[] = []
  
  for (let i = 0; i < posAttr.count; i++) {
    // 读取原始坐标并乘上缩放
    vertices.push(
      posAttr.getX(i) * scale.x,
      posAttr.getY(i) * scale.y,
      posAttr.getZ(i) * scale.z
    )
  }
  return new Float32Array(vertices)
}

// --- 核心逻辑: 扫描并创建子碰撞体 ---

const scanAndCreateColliders = (rootBody: RAPIER_TYPE.RigidBody, rootObj: THREE.Object3D, rbConfig: any) => {
  if (!worldRef || !worldRef.value) return

  const colliderType = rbConfig.colliderType || 'hull'
  const isTrigger = rbConfig.isTrigger || false
  const friction = rbConfig.friction ?? 0.5
  const restitution = rbConfig.restitution ?? 0.5

  // 1. 构建“刚体参考系矩阵” (RB Reference Frame)
  // 刚体本身是没有缩放的 (Scale=1,1,1)，它只在世界空间中有位置和旋转。
  // 我们必须创建一个“纯净”的父级矩阵，只包含位移和旋转，不包含父级可能存在的缩放。
  rootObj.updateMatrixWorld(true)
  const rootWorldPos = new THREE.Vector3()
  const rootWorldQuat = new THREE.Quaternion()
  rootObj.getWorldPosition(rootWorldPos)
  rootObj.getWorldQuaternion(rootWorldQuat)
  
  // 这是一个“无缩放”的父级世界矩阵
  const rbFrameMatrix = new THREE.Matrix4().compose(
    rootWorldPos, 
    rootWorldQuat, 
    new THREE.Vector3(1, 1, 1) // 🟢 强制缩放为 1
  )
  const rbFrameInverse = rbFrameMatrix.invert()

  // 递归遍历
  rootObj.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    if (child.userData.noCollision) return 

    const mesh = child as THREE.Mesh
    if (!mesh.geometry) return

    // 2. 计算 Mesh 在“刚体参考系”下的变换
    child.updateMatrixWorld(true)
    
    // 相对矩阵 = 刚体逆矩阵 * 子物体世界矩阵
    // 因为刚体逆矩阵不包含缩放，所以子物体的世界缩放（包含父级传递下来的缩放）会被完整保留在 relativeMat 中！
    const relativeMat = rbFrameInverse.clone().multiply(child.matrixWorld)
    
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    
    relativeMat.decompose(pos, quat, scale)

    // 🟢 3. 将分离出来的 Scale 传给几何体生成器
    let desc: RAPIER_TYPE.ColliderDesc | null = null

    if (colliderType === 'trimesh') {
       const data = createTrimeshFromMesh(mesh, scale)
       if (data) desc = RAPIER.ColliderDesc.trimesh(data.vertices, data.indices)
    } else {
       // 默认 Hull
       const v = createConvexHullFromMesh(mesh, scale)
       if (v) desc = RAPIER.ColliderDesc.convexHull(v)
    }

    if (!desc) return

    // 设置材质
    desc.setRestitution(restitution)
    desc.setFriction(friction)
    if (isTrigger) desc.setSensor(true)

    // 设置相对位置和旋转 (注意：缩放已经“烘焙”进顶点数据了，所以这里不需要再设 Scale)
    desc.setTranslation(pos.x, pos.y, pos.z)
    desc.setRotation(quat)

    // 创建并挂载
    const c = worldRef.value.createCollider(desc, rootBody)
    colliders.push(c)
    
    const ownerId = child.userData.id || props.node.id
    if (registry) registry.register(c.handle, ownerId)
  })
  
  console.log(`[Physics] 🔨 Created ${colliders.length} colliders for ${props.node.name} (with Scale fix)`)
}

// --- 初始化车辆逻辑 (和之前保持一致) ---
const setupVehicle = (body: RAPIER_TYPE.RigidBody) => {
  const chassisComp = props.node.components.find(c => c.type === 'VehicleChassis')
  if (!chassisComp) return

  const chassisProps = flattenProps(chassisComp.props)
  const offset = chassisProps.centerOfMassOffset || [0, 0, 0]
  body.setAdditionalMassProperties(
    body.mass(), 
    { x: offset[0], y: offset[1], z: offset[2] }, 
    { x: 0, y: 0, z: 0 }, 
    { x: 0, y: 0, z: 0, w: 1 }
  )

  vehicleController = worldRef.value!.createVehicleController(body)
  const vehicleData = { controller: vehicleController, wheels: [] as any[] }
  const worldRoot = props.object3d.parent || props.object3d

  const findWheels = (n: IGameNode) => {
    n.components.forEach(c => {
      if (c.type === 'VehicleWheel') {
        let wheelObj: THREE.Object3D | null = null
        props.object3d.traverse(o => { if (o.userData.id === n.id) wheelObj = o })
        
        if (wheelObj) {
          console.log(wheelObj)
           // 标记轮子不要生成碰撞体 (重要!)
           wheelObj.traverse(o => { o.userData.noCollision = true })

           const config = flattenProps(c.props)
           const calib = calibrateWheel(wheelObj as THREE.Mesh, props.object3d)
           if (calib) {
             const finalRadius = calib.radius * (config.radiusScale || 1.0)
             
             vehicleController!.addWheel(
               calib.connectionPoint, calib.direction, calib.axle, 
               config.suspensionRestLength ?? 0.3, finalRadius
             )
             
             const idx = vehicleController!.numWheels() - 1
             vehicleController!.setWheelSuspensionStiffness(idx, config.suspensionStiffness ?? 50)
             vehicleController!.setWheelMaxSuspensionTravel(idx, config.maxSuspensionTravel ?? 0.2)
             vehicleController!.setWheelSideFrictionStiffness(idx, 1.5) 
             vehicleController!.setWheelSuspensionCompression(idx, 4.0)
             vehicleController!.setWheelSuspensionRelaxation(idx, 4.0)

             // 轮子分离逻辑
             const op = wheelObj.parent
             if (op) {
               worldRoot.attach(wheelObj)
               detachedWheels.push({ object: wheelObj, originalParent: op })
             }

             vehicleData.wheels.push({
               index: idx, nodeId: n.id, object: wheelObj,
               isDrive: config.isDrive, isSteering: config.isSteering, brakeForce: config.brakeForce ?? 1.0,
               currentSteering: 0, currentRotation: 0, 
               connectionPoint: calib.connectionPoint, direction: calib.direction,
               radius: finalRadius
             })
           }
        }
      }
    })
    if (n.children) n.children.forEach(findWheels)
  }
  
  findWheels(props.node)
  props.object3d.userData.vehicle = vehicleData
}

const updateVehiclePhysics = () => {
  if (vehicleController && worldRef?.value) {
    try { vehicleController.updateVehicle(worldRef.value.timestep) } catch (e) {}
  }
}

// --- 初始化入口 ---
const initPhysics = () => {
  // 1. 基础检查
  if (!worldRef?.value || !props.object3d) return
  const rbComp = props.node.components.find(c => c.type === 'RigidBody')
  if (!rbComp) return

  const rbProps = flattenProps(rbComp.props)
  const type = rbProps.bodyType || 'dynamic'
  
  // 2. 🟢 [修复] 统一创建 RigidBodyDesc
  let bodyDesc: RAPIER_TYPE.RigidBodyDesc
  
  if (type === 'fixed') {
    bodyDesc = RAPIER.RigidBodyDesc.fixed()
  } 
  else if (type === 'kinematicPositionBased') {
    // 角色控制器必须配合 Kinematic 刚体使用
    bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
  } 
  else {
    bodyDesc = RAPIER.RigidBodyDesc.dynamic()
  }
  
  // 设置通用参数
  bodyDesc.setLinearDamping(rbProps.linearDamping ?? 0)
  bodyDesc.setAngularDamping(rbProps.angularDamping ?? 0)
  
  // 设置初始位置
  props.object3d.updateMatrixWorld(true)
  const pos = new THREE.Vector3(); props.object3d.getWorldPosition(pos)
  const rot = new THREE.Quaternion(); props.object3d.getWorldQuaternion(rot)
  bodyDesc.setTranslation(pos.x, pos.y, pos.z)
  bodyDesc.setRotation(rot)

  // 3. 创建刚体
  rigidBody = worldRef.value.createRigidBody(bodyDesc)
  rigidBody.enableCcd(true)

  // 4. 创建碰撞体
  scanAndCreateColliders(rigidBody, props.object3d, rbProps)

  // 5. 挂载刚体引用
  props.object3d.userData.physicsBody = rigidBody
  emit('created', rigidBody)

  // 6. 🟢 [修复] 附加角色控制器逻辑 (使用 worldRef.value)
  if (type === 'kinematicPositionBased') {
    // 偏移量 0.01
    characterController = worldRef.value.createCharacterController(0.01)
    
    // 自动台阶 (maxHeight, minWidth, includeDynamicBodies)
    characterController.enableAutostep(0.3, 0.1, true)
    
    // 贴地 (distance)
    characterController.enableSnapToGround(0.2)
    
    // 挂载到 userData，供脚本使用
    props.object3d.userData.characterController = characterController
    
    console.log(`[Physics] 👤 CharacterController created for ${props.node.name}`)
  }

  // 7. 车辆逻辑
  if (props.node.components.some(c => c.type === 'VehicleChassis')) {
    setupVehicle(rigidBody)
    if (preStepSystem) preStepSystem.register(updateVehiclePhysics)
  }
}

// 帧同步
const { onBeforeRender } = useLoop()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _tempAxisY = new THREE.Vector3(0, 1, 0)
const _tempAxisX = new THREE.Vector3(1, 0, 0)
const _qSteer = new THREE.Quaternion()
const _qRoll = new THREE.Quaternion()
const _chassisPos = new THREE.Vector3()
const _chassisQuat = new THREE.Quaternion()
const _tempPos = new THREE.Vector3()
const _wheelLocalPos = new THREE.Vector3()
const _wheelLocalQuat = new THREE.Quaternion()

onBeforeRender(() => {
  const world = worldRef?.value
  if (!world) return

  // 1. 同步车身 (Physics -> Visual)
  if (rigidBody) {
    const t = rigidBody.translation()
    const r = rigidBody.rotation()
    _chassisPos.set(t.x, t.y, t.z)
    _chassisQuat.set(r.x, r.y, r.z, r.w)
  }

  // 2. 同步车轮 (Vehicle -> Visual)
  if (vehicleController && props.object3d.userData.vehicle) {
    try {
      const wheelsMeta = props.object3d.userData.vehicle.wheels
      
      for (let i = 0; i < vehicleController.numWheels(); i++) {
        const meta = wheelsMeta[i]
        if (!meta || !meta.object) continue

        // 🟢 [核心修复]：直接使用 Meta 中缓存的静态数据！
        // 不要调用 vehicleController.wheelChassisConnectionPoint(i)，那个方法可能不存在或有问题
        const connection = meta.connectionPoint
        const dir = meta.direction
        
        // 只获取动态数据：悬挂当前的伸缩长度
        const suspensionLen = vehicleController.wheelSuspensionLength(i) || 0

        // 计算轮子在车身局部的坐标：挂载点 + (方向 * 悬挂长度)
        _wheelLocalPos.copy(connection).addScaledVector(dir, suspensionLen)

        // 获取旋转数据 (优先使用 Script 计算的视觉欺骗值，如果没有则用物理引擎值)
        const steeringAngle = (meta.currentSteering !== undefined) 
           ? meta.currentSteering 
           : (vehicleController.wheelSteering(i) || 0)
           
        const rotationAngle = (meta.currentRotation !== undefined)
           ? meta.currentRotation
           : (vehicleController.wheelRotation(i) || 0)

        // 计算局部旋转
        const qSteer = new THREE.Quaternion().setFromAxisAngle(_tempAxisY, steeringAngle)
        const qRotate = new THREE.Quaternion().setFromAxisAngle(_tempAxisX, rotationAngle)
        _wheelLocalQuat.copy(qSteer).multiply(qRotate)

        // 组合变换：World = ChassisWorld * (LocalPos + LocalRot)
        _tempPos.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos)
        
        meta.object.position.copy(_tempPos)
        meta.object.quaternion.copy(_chassisQuat).multiply(_wheelLocalQuat)
      }
    } catch (e) {
      console.warn('Vehicle update error:', e)
    }
  }

  // 3. 应用到根物体
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

onMounted(() => { setTimeout(initPhysics, 50) })

onUnmounted(() => {
  if (preStepSystem) preStepSystem.unregister(updateVehiclePhysics)
  detachedWheels.forEach(({ object, originalParent }) => {
    if (originalParent) originalParent.attach(object)
  })
  if (vehicleController) vehicleController.free()
  colliders.forEach(c => { if (registry) registry.unregister(c.handle) })
  if (worldRef?.value && rigidBody) worldRef.value.removeRigidBody(rigidBody)
  if (props.object3d) {
    props.object3d.userData.physicsBody = null
    props.object3d.userData.vehicle = null
  }
})
</script>

<template></template>