<script setup lang="ts">
import { inject, onUnmounted, provide, shallowRef, watch, type ShallowRef } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { IGameNode } from '../types/schema'
import { calibrateWheel } from '../utils/wheelUtils'
import type RAPIER_TYPE from '@dimforge/rapier3d-compat'

const props = defineProps<{
  node: IGameNode
  object3d: THREE.Object3D
}>()

// 注入物理世界和 Rapier 实例
const world = inject<ShallowRef<RAPIER_TYPE.World>>('physics-world')!.value

// 获取组件数据
const chassisComp = props.node.components.find(c => c.type === 'VehicleChassis')
// 获取刚体 (由 PhysicsItem 创建并挂载在 userData 上)
const rigidBody = props.object3d.userData.physicsBody as RAPIER_TYPE.RigidBody

// 内部状态
let vehicleController: RAPIER_TYPE.DynamicRayCastVehicleController | null = null
// 🟢 关键修复 1: 存储定时器 ID，以便卸载时清除
let initTimer: any = null

// 待注册的轮子队列
const pendingWheels = shallowRef<Array<{
  mesh: THREE.Mesh,
  config: any,
  nodeId: string
}>>([])

// 提供给子组件注册轮子的方法
const registerWheel = (wheelMesh: THREE.Mesh, wheelConfig: any, nodeId: string) => {
  pendingWheels.value.push({ mesh: wheelMesh, config: wheelConfig, nodeId })
}
provide('vehicle-registry', { registerWheel })

// 初始化车辆控制器
const initVehicle = () => {
  // 🟢 关键修复 2: 严密的空值检查
  // 如果组件已卸载、刚体未创建、或物理世界已销毁，直接退出
  if (!world || !rigidBody || !chassisComp) return
  if (vehicleController) return // 防止重复初始化

  // 检查刚体是否仍然存在于物理世界中 (防止刚体已被 PhysicsItem 移除)
  if (!world.bodies.contains(rigidBody.handle)) {
    console.warn('[Vehicle] RigidBody handle not found in world, skipping init.')
    return
  }

  console.log('[Vehicle] Building Chassis for', props.node.name)

  try {
    // 1. 创建控制器
    vehicleController = world.createVehicleController(rigidBody)

    // 挂载到 userData 供脚本使用
    props.object3d.userData.vehicle = {
      controller: vehicleController,
      wheels: [] as any[]
    }

    // 2. 遍历并添加所有轮子
    pendingWheels.value.forEach((item, index) => {
      // 自动校准轮子位置和轴向
      const calibration = calibrateWheel((item.mesh as any), props.object3d)
      if (!calibration) {
        console.warn(`[Vehicle] Failed to calibrate wheel: ${item.nodeId}`)
        return
      }

      const { radius, axle, direction, connectionPoint } = calibration
      
      // 读取配置参数
      const finalRadius = radius * (item.config.radiusScale || 1.0)
      const restLength = item.config.suspensionRestLength ?? 0.3
      const maxTravel = item.config.maxSuspensionTravel ?? 0.2
      const stiffness = item.config.suspensionStiffness ?? 50.0

      // 添加到 Rapier 控制器
      vehicleController!.addWheel(
        connectionPoint, 
        direction, 
        axle, 
        restLength, 
        finalRadius
      )

      // 设置悬挂参数
      vehicleController!.setWheelSuspensionStiffness(index, stiffness)
      vehicleController!.setWheelMaxSuspensionTravel(index, maxTravel)
      
      // 记录元数据供脚本使用
      props.object3d.userData.vehicle.wheels.push({
        index,
        nodeId: item.nodeId,
        mesh: item.mesh,
        isDrive: !!item.config.isDrive,
        isSteering: !!item.config.isSteering,
        brakeForce: item.config.brakeForce || 1.0
      })
      
      console.log(`[Vehicle] Added wheel ${index}: R=${finalRadius.toFixed(2)}`)
    })
  } catch (e) {
    console.error('[Vehicle] Critical Init Error:', e)
    // 如果初始化失败，清理可能创建的半成品
    if (vehicleController) {
      try { vehicleController.free() } catch(err) {}
      vehicleController = null
    }
  }
}

// 监听刚体生成 (PhysicsItem 初始化是异步的)
watch(() => props.object3d.userData.physicsBody, (body) => {
  if (body) {
    // 🟢 关键修复 3: 记录 timer ID
    if (initTimer) clearTimeout(initTimer)
    initTimer = setTimeout(initVehicle, 100)
  }
})

// 帧循环：物理驱动视觉
const { onBeforeRender } = useLoop()

const _tempAxisY = new THREE.Vector3(0, 1, 0)
const _tempAxisX = new THREE.Vector3(1, 0, 0)
const _qSteer = new THREE.Quaternion()
const _qRoll = new THREE.Quaternion()

onBeforeRender(() => {
  if (!vehicleController || !props.object3d.userData.vehicle) return

  try {
    // 1. 物理步进
    vehicleController.updateVehicle(world.timestep)
    
    // 2. 同步轮子
    const wheelsMeta = props.object3d.userData.vehicle.wheels
    
    for (let i = 0; i < vehicleController.numWheels(); i++) {
        const meta = wheelsMeta[i]
        if (!meta || !meta.mesh) continue
        
        // --- A. 获取物理数据 ---
        const connection = vehicleController.wheelChassisConnectionPointCs(i)
        const suspensionLen = vehicleController.wheelSuspensionLength(i)
        const dir = vehicleController.wheelDirectionCs(i)
        
        // 🟢 关键：从引擎获取当前的滚动弧度 (Rolling) 和 转向弧度 (Steering)
        const rawRotation = vehicleController.wheelRotation(i) || 0
        const rawSteer = vehicleController.wheelSteering(i) || 0

        // 🟢 关键：把数据存回 meta，这样你的 CarController.js 就能读到了！
        meta.rotation = rawRotation // 累计滚动的弧度
        meta.steering = rawSteer    // 当前转向的弧度

        // --- B. 同步位置 ---
        const currentLocalPos = new THREE.Vector3()
          .copy(connection as any)
          .addScaledVector(dir as any, suspensionLen as number)
        
        meta.mesh.position.copy(currentLocalPos)
        
        // --- C. 同步旋转 (修复后轮不转的问题) ---
        // 1. 计算转向四元数 (绕 Y 轴)
        _qSteer.setFromAxisAngle(_tempAxisY, rawSteer)
        
        // 2. 计算滚动四元数 (绕 X 轴)
        // 这里的 rawRotation 是累加值，车动得越久，值越大，正是我们要的
        _qRoll.setFromAxisAngle(_tempAxisX, rawRotation)
        
        // 3. 合并旋转: 先转向，再滚动
        // meta.mesh 是挂在车身下的，所以直接设置局部旋转即可
        meta.mesh.quaternion.copy(_qSteer).multiply(_qRoll)
    }
  } catch (e) {
    // console.warn('[Vehicle] Update error', e)
  }
})

onUnmounted(() => {
  // 🟢 关键修复 4: 必须清除定时器！
  // 防止组件销毁后，initVehicle 依然被执行，导致 "Cannot read properties of null"
  if (initTimer) {
    clearTimeout(initTimer)
    initTimer = null
  }

  // 🟢 关键修复 5: 安全释放 Controller
  if (vehicleController) {
    try {
      vehicleController.free()
    } catch(e) { 
      // 忽略销毁时的错误（例如 World 已经先一步被销毁了）
    }
    vehicleController = null
  }

  // 清理 userData，断开引用
  if (props.object3d && props.object3d.userData) {
    props.object3d.userData.vehicle = null
  }
  
  // ⛔️ 严禁调用 world.free()，那是 PhysicsSystem 的工作！
})
</script>

<template>
  <slot></slot>
</template>