<script setup lang="ts">
import { inject, onMounted, onUnmounted, shallowRef, watch, Ref } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { IGameNode } from '../../types/schema'
import type RAPIER_TYPE from '@dimforge/rapier3d-compat'

const props = defineProps<{
  node: IGameNode
  object3d: THREE.Object3D
}>()

const emit = defineEmits(['created'])

const world = inject<shallowRef<RAPIER_TYPE.World>>('physics-world')!.value
const RAPIER = inject<typeof RAPIER_TYPE>('rapier-instance')!

// 接收父级刚体 (实现复合碰撞体 Compound Shape)
const parentBodyRef = inject<Ref<RAPIER_TYPE.RigidBody | null>>('parent-body-ref', shallowRef(null))

let rigidBody: RAPIER_TYPE.RigidBody | null = null
let collider: RAPIER_TYPE.Collider | null = null
// 🟢 新增：存储角色控制器实例
let characterController: RAPIER_TYPE.KinematicCharacterController | null = null

const findMesh = (obj: THREE.Object3D): THREE.Mesh | null => {
  if (obj.type === 'Mesh') return obj as THREE.Mesh
  for (const child of obj.children) {
    const found = findMesh(child)
    if (found) return found
  }
  return null
}

/**
 * 通用函数：创建并挂载碰撞体
 * @param targetBody 挂载的目标刚体
 * @param isChild 是否作为子对象挂载（需要计算相对偏移）
 */
const attachCollider = (targetBody: RAPIER_TYPE.RigidBody, isChild: boolean) => {
  const meshProps = props.node.components.find(c => c.type === 'Mesh')?.props
  const rbProps = props.node.components.find(c => c.type === 'RigidBody')?.props
  
  if (!meshProps) return

  let colliderDesc: RAPIER_TYPE.ColliderDesc | null = null
  const colliderType = rbProps?.colliderType || 'primitive'
  
  // 🔴 FIX START: 使用世界缩放，而不是局部 node.scale
  // 这样如果父级缩放了，子物体的碰撞箱也会正确地"变小"
  const scale = new THREE.Vector3()
  props.object3d.updateWorldMatrix(true, false) // 确保矩阵是最新的
  props.object3d.getWorldScale(scale)
  // 🔴 FIX END

  // === 1. 生成碰撞体描述 (Hull / Trimesh / Primitive) ===
  const shouldUseMesh = colliderType === 'hull' || colliderType === 'trimesh'
  
  if (shouldUseMesh) {
    const mesh = findMesh(props.object3d)
    if (mesh && mesh.geometry) {
      const geometry = mesh.geometry
      const posAttr = geometry.attributes.position
      const vertices = new Float32Array(posAttr.count * 3)
      // 烘焙缩放
      for (let i = 0; i < posAttr.count; i++) {
        vertices[i * 3 + 0] = posAttr.getX(i) * scale.x // 使用 .x .y .z
        vertices[i * 3 + 1] = posAttr.getY(i) * scale.y
        vertices[i * 3 + 2] = posAttr.getZ(i) * scale.z
      }
      if (colliderType === 'hull') {
        colliderDesc = RAPIER.ColliderDesc.convexHull(vertices)
      } else if (geometry.index) {
        const indices = new Uint32Array(geometry.index.array)
        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      }
    }
  } 

  if (!colliderDesc) {
    const args = meshProps.args || []
    // 注意：这里用 scale.x, scale.y, scale.z 替换数组索引
    switch (meshProps.geometry) {
      case 'Box':
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          (args[0]??1) * scale.x / 2, 
          (args[1]??1) * scale.y / 2, 
          (args[2]??1) * scale.z / 2
        )
        break
      case 'Sphere':
        // 球体通常取最大轴缩放，或者均匀缩放
        colliderDesc = RAPIER.ColliderDesc.ball(
          (args[0]??1) * Math.max(scale.x, scale.y, scale.z)
        )
        break
      case 'Plane':
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          (args[0]??1) * scale.x / 2, 
          (args[1]??1) * scale.y / 2, 
          0.005 * scale.z // 平面厚度也受 Z 轴缩放影响
        )
        break
    }
  }

  if (!colliderDesc) return

  // 应用物理材质参数
  if (rbProps) {
    colliderDesc.setRestitution(rbProps.restitution ?? 0.5)
    colliderDesc.setFriction(rbProps.friction ?? 0.5)
  }

  // === 2. 计算相对偏移 (仅针对子对象碰撞体) ===
  if (isChild) {
    props.object3d.updateWorldMatrix(true, false)
    
    const myPos = new THREE.Vector3()
    const myQuat = new THREE.Quaternion()
    props.object3d.getWorldPosition(myPos)
    props.object3d.getWorldQuaternion(myQuat)

    const bPos = targetBody.translation()
    const bRot = targetBody.rotation()
    const bQuat = new THREE.Quaternion(bRot.x, bRot.y, bRot.z, bRot.w)

    const parentMat = new THREE.Matrix4().compose(
      new THREE.Vector3(bPos.x, bPos.y, bPos.z), bQuat, new THREE.Vector3(1,1,1)
    )
    const childMat = new THREE.Matrix4().compose(myPos, myQuat, new THREE.Vector3(1,1,1))
    
    const relMat = parentMat.invert().multiply(childMat)
    const relPos = new THREE.Vector3()
    const relQuat = new THREE.Quaternion()
    const relScale = new THREE.Vector3()
    relMat.decompose(relPos, relQuat, relScale)

    colliderDesc.setTranslation(relPos.x, relPos.y, relPos.z)
    colliderDesc.setRotation(relQuat)
  }

  collider = world.createCollider(colliderDesc, targetBody)
}

const initPhysics = () => {
  if (!world || !props.object3d) return

  const rbProps = props.node.components.find(c => c.type === 'RigidBody')?.props

  // 情况 A: 拥有 RigidBody 组件 (刚体所有者)
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

    // 同步初始世界坐标
    props.object3d.updateWorldMatrix(true, false)
    const worldPos = new THREE.Vector3()
    const worldRot = new THREE.Quaternion()
    props.object3d.getWorldPosition(worldPos)
    props.object3d.getWorldQuaternion(worldRot)
    
    bodyDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z)
    bodyDesc.setRotation({ x: worldRot.x, y: worldRot.y, z: worldRot.z, w: worldRot.w })

    rigidBody = world.createRigidBody(bodyDesc)
    props.object3d.userData.physicsBody = rigidBody
    
    emit('created', rigidBody)
    attachCollider(rigidBody, false)

    // 🟢 重点：为运动学刚体初始化角色控制器 (KCC)
    if (type === 'kinematicPositionBased') {
      // 创建控制器，0.01 是安全偏置值
      characterController = world.createCharacterController(0.01)
      // 配置：支持 45 度爬坡
      characterController.setMaxSlopeClimbAngle(45 * (Math.PI / 180))
      // 配置：支持 0.3 米台阶自动跨越
      characterController.enableAutostep(0.3, 0.1, true)
      // 配置：地面吸附，防止跑下斜坡时起飞
      characterController.enableSnapToGround(0.2)

      // 暴露给外部脚本 API
      props.object3d.userData.characterController = characterController
    }
  } 
  
  // 情况 B: 没组件，但有父级刚体 (挂载碰撞体到父亲身上)
  else if (parentBodyRef && parentBodyRef.value) {
    attachCollider(parentBodyRef.value, true)
    watch(parentBodyRef, (pBody) => {
      if (pBody && !collider) attachCollider(pBody, true)
    })
  }

  // 情况 C: 没组件也没爸爸 (静态环境物体)
  else {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
    props.object3d.updateWorldMatrix(true, false)
    const worldPos = new THREE.Vector3()
    const worldRot = new THREE.Quaternion()
    props.object3d.getWorldPosition(worldPos)
    props.object3d.getWorldQuaternion(worldRot)
    
    bodyDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z)
    bodyDesc.setRotation({ x: worldRot.x, y: worldRot.y, z: worldRot.z, w: worldRot.w })
    
    rigidBody = world.createRigidBody(bodyDesc)
    attachCollider(rigidBody, false)
  }
}

// 帧同步
const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  if (rigidBody && props.object3d) {
    const type = rigidBody.bodyType()

    // 1. 物理驱动视觉 (Dynamic): 物体自由落体、碰撞移动
    if (type === RAPIER.RigidBodyType.Dynamic) {
      const pos = rigidBody.translation()
      const rot = rigidBody.rotation()
      props.object3d.position.set(pos.x, pos.y, pos.z)
      props.object3d.quaternion.set(rot.x, rot.y, rot.z, rot.w)
    } 
    
    // 2. 视觉驱动物理 (Kinematic): 脚本控制移动/旋转
    // 即使使用了 KCC，我们也需要同步最终的 Transform 给物理引擎做碰撞检测
    else if (type === RAPIER.RigidBodyType.KinematicPositionBased) {
      rigidBody.setNextKinematicTranslation(props.object3d.position)
      rigidBody.setNextKinematicRotation(props.object3d.quaternion)
    }
  }
})

onMounted(() => {
  // 延迟一帧确保 ThreeJS 场景树构建完成
  setTimeout(initPhysics, 50)
})

onUnmounted(() => {
  if (world && rigidBody) {
    world.removeRigidBody(rigidBody)
  }
  // 🟢 释放资源
  if (props.object3d) {
    props.object3d.userData.physicsBody = null
    props.object3d.userData.characterController = null
  }
})
</script>

<template></template>