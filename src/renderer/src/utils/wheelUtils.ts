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
  wheelMesh: THREE.Mesh, 
  chassisObject: THREE.Object3D
): WheelCalibrationData | null => {
  if (!wheelMesh.geometry) return null

  // 1. 获取几何体的 AABB
  wheelMesh.geometry.computeBoundingBox()
  const box = wheelMesh.geometry.boundingBox!
  const size = new THREE.Vector3()
  box.getSize(size)

  // 🟢 FIX A: 获取轮子的世界缩放，算出真实物理半径
  const wheelWorldScale = new THREE.Vector3()
  wheelMesh.updateMatrixWorld(true)
  wheelMesh.getWorldScale(wheelWorldScale)

  // 找到最大轴作为直径轴 (通常是 Y 或 Z，取决于你的扁球体方向)
  // 我们假设轮子是圆的，所以取 Y 和 Z 的最大值乘上对应的缩放
  // 你的轮子 scale: [0.08, 1.06, 0.15]，明显 Y 是直径
  const dims = [ 
    { axis: 'x', val: size.x * wheelWorldScale.x }, 
    { axis: 'y', val: size.y * wheelWorldScale.y }, 
    { axis: 'z', val: size.z * wheelWorldScale.z } 
  ]
  dims.sort((a, b) => a.val - b.val)

  const thicknessAxis = dims[0].axis 
  const diameterAxis = dims[2].axis  
  
  const radius = dims[2].val / 2 // 🟢 真实的物理半径
  const halfWidth = dims[0].val / 2

  // ... (轮轴方向计算保持不变) ...
  const localAxle = new THREE.Vector3()
  if (thicknessAxis === 'x') localAxle.set(1, 0, 0)
  else if (thicknessAxis === 'y') localAxle.set(0, 1, 0)
  else localAxle.set(0, 0, 1)

  chassisObject.updateMatrixWorld(true)
  const worldAxle = localAxle.clone().transformDirection(wheelMesh.matrixWorld).normalize()
  const chassisInverse = new THREE.Matrix4().copy(chassisObject.matrixWorld).invert()
  const chassisSpaceAxle = worldAxle.clone().transformDirection(chassisInverse).normalize()

  // 🟢 FIX B: 修正挂载点坐标 (解决跷跷板问题)
  // Rapier 需要的是"物理空间"的坐标 (Meters)。
  // chassisInverse 算出的是"归一化局部坐标" (Scale=1 的空间)。
  // 如果车身缩放了 (1, 0.4, 3.2)，我们需要把这个缩放乘回去！
  const chassisScale = new THREE.Vector3()
  chassisObject.getWorldScale(chassisScale)

  const wheelWorldPos = new THREE.Vector3()
  wheelMesh.getWorldPosition(wheelWorldPos)
  
  // 1. 转到车身局部空间 (此时含缩放归一化)
  const connectionPoint = wheelWorldPos.clone().applyMatrix4(chassisInverse)
  
  // 2. 乘回车身缩放，还原为真实的"米"
  connectionPoint.multiply(chassisScale)

  const chassisSpaceDirection = new THREE.Vector3(0, -1, 0)

  return {
    radius,
    halfWidth,
    axle: chassisSpaceAxle,
    direction: chassisSpaceDirection,
    connectionPoint
  }
}