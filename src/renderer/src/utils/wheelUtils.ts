// src/utils/wheelUtils.ts
import * as THREE from 'three'

export interface WheelCalibrationData {
  radius: number
  halfWidth: number
  axle: THREE.Vector3
  direction: THREE.Vector3
  connectionPoint: THREE.Vector3
}

export const calibrateWheel = (
  wheelObj: THREE.Object3D, // 🟢 修改：不再强制要求是 Mesh
  chassisObject: THREE.Object3D
): WheelCalibrationData | null => {
  
  // 1. 🔍 寻找真正的 Mesh (几何体携带者)
  let targetMesh: THREE.Mesh | null = null
  
  if ((wheelObj as THREE.Mesh).isMesh) {
    targetMesh = wheelObj as THREE.Mesh
  } else {
    // 如果是 Group，向下遍历找到第一个 Mesh
    wheelObj.traverse((child) => {
      if (!targetMesh && (child as THREE.Mesh).isMesh) {
        targetMesh = child as THREE.Mesh
      }
    })
  }

  // 如果连子节点里都没有 Mesh，那这个轮子确实是空的，没法算
  if (!targetMesh || !targetMesh.geometry) return null

  // 2. 获取几何体的 AABB (使用找到的 targetMesh)
  targetMesh.geometry.computeBoundingBox()
  const box = targetMesh.geometry.boundingBox!
  const size = new THREE.Vector3()
  box.getSize(size)

  // 🟢 FIX A: 获取轮子的世界缩放
  // 注意：我们要获取 targetMesh 的世界缩放，因为它包含了父级 Group 的缩放
  const wheelWorldScale = new THREE.Vector3()
  targetMesh.updateMatrixWorld(true)
  targetMesh.getWorldScale(wheelWorldScale)

  // 3. 自动识别轮子朝向
  // 逻辑：轮子通常是扁的圆柱体。最长的两个轴是直径，最短的轴是厚度（轴向）。
  const dims = [ 
    { axis: 'x', val: size.x * wheelWorldScale.x }, 
    { axis: 'y', val: size.y * wheelWorldScale.y }, 
    { axis: 'z', val: size.z * wheelWorldScale.z } 
  ]
  // 从小到大排序：[厚度, 直径1, 直径2]
  dims.sort((a, b) => a.val - b.val)

  const thicknessAxis = dims[0].axis 
  // const diameterAxis = dims[2].axis  
  
  const radius = dims[2].val / 2 // 🟢 真实的物理半径
  const halfWidth = dims[0].val / 2

  // 4. 计算方向向量 (Local Space of Wheel)
  // 悬挂方向通常是向下 (与车身有关，但默认假设由 setupVehicle 里的 raycast 方向决定，这里主要算轴向)
  // Rapier 默认：Wheel Direction 是 -Y (向下)，Wheel Axle 是 -X (向外? 视情况而定)
  
  // 我们需要算出：在 Wheel 自己的局部坐标系下，哪个轴是旋转轴，哪个是向下
  // 但 calibrate 的输出是给 VehicleController 用的，Rapier 要求这些向量是在 Chassis 的坐标系下。
  
  // 简化策略：
  // suspensionDirection 永远是 (0, -1, 0) （相对于车身）
  // axle 永远是 (1, 0, 0) 或 (0, 0, 1) （取决于车轮是左右装还是前后装）
  
  // 我们根据 thicknessAxis 决定轴向
  const localAxle = new THREE.Vector3()
  if (thicknessAxis === 'x') localAxle.set(1, 0, 0)
  else if (thicknessAxis === 'y') localAxle.set(0, 1, 0)
  else localAxle.set(0, 0, 1)

  // 转换到 Chassis 空间
  // Axle: WheelLocal -> World -> ChassisLocal
  chassisObject.updateMatrixWorld(true)
  
  // 注意：这里用 targetMesh 来算轴向，因为它是真正旋转的东西
  const worldAxle = localAxle.clone().transformDirection(targetMesh.matrixWorld).normalize()
  
  const chassisInverse = new THREE.Matrix4().copy(chassisObject.matrixWorld).invert()
  
  // 变换方向向量到车身局部空间
  const chassisSpaceAxle = worldAxle.clone().transformDirection(chassisInverse).normalize()
  
  // 默认悬挂方向向下 (0, -1, 0) 
  // 这里暂时写死，因为大部分车轮都是向下悬挂。如果你的车轮是斜着的，需要额外计算
  const chassisSpaceDirection = new THREE.Vector3(0, -1, 0)

  // 🟢 FIX B: 修正挂载点坐标
  // 我们使用 wheelObj (即 Group) 的位置作为挂载点，而不是内部 Mesh 的位置
  // 因为 Mesh 可能在 Group 内部有偏移（Pivot Point 问题）
  wheelObj.updateMatrixWorld(true)
  const wheelWorldPos = new THREE.Vector3()
  wheelObj.getWorldPosition(wheelWorldPos)
  
  const chassisScale = new THREE.Vector3()
  chassisObject.getWorldScale(chassisScale)

  // 将世界坐标转回车身局部坐标
  const connectionPoint = wheelWorldPos.clone()
    .applyMatrix4(chassisInverse)
    // 再次提醒：Rapier 的坐标不包含 Scale，如果父级有 Scale，applyMatrix4 算出来的结果是“被缩放过的局部坐标”
    // 我们需要把这个坐标“还原”为物理世界的米
    .multiply(chassisScale) 

  return {
    radius,
    halfWidth,
    axle: chassisSpaceAxle,
    direction: chassisSpaceDirection,
    connectionPoint
  }
}