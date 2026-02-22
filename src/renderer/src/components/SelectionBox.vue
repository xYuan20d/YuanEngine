<script setup lang="ts">
import { ref } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'

const props = defineProps<{
  object: THREE.Object3D
}>()

// 状态：控制外层 Group 的位置/旋转/缩放，以及内层 Mesh 的大小/偏移
const boxState = ref({
  parentMatrix: new THREE.Matrix4(), // 核心：直接同步父物体的世界矩阵
  position: [0, 0, 0] as [number, number, number], // 内层 Mesh 的局部偏移
  scale: [1, 1, 1] as [number, number, number],    // 内层 Mesh 的尺寸
  visible: false
})

const { onBeforeRender } = useLoop()

// --- 缓存变量 (避免 GC 卡顿) ---
const inverseMatrix = new THREE.Matrix4()
const localBox = new THREE.Box3()
const childBox = new THREE.Box3()

// 盒子的8个顶点偏移量 (用于将子物体的 AABB 转换坐标系)
const corners = [
  new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
]

onBeforeRender(() => {
  if (!props.object) {
    boxState.value.visible = false
    return
  }

  const parent = props.object
  
  // 1. 强制更新父子矩阵，确保数据是最新的
  parent.updateMatrixWorld(true)

  // 2. 准备“父级逆矩阵”
  // 它可以把世界坐标变回父级的局部坐标
  // 这样我们就能算出所有子物体在“父级还没旋转时”的位置范围
  inverseMatrix.copy(parent.matrixWorld).invert()

  // 3. 重置局部包围盒
  localBox.makeEmpty()

  let hasMesh = false

  // 4. 遍历所有子孙 (Traverse)
  parent.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      hasMesh = true
      
      // A. 获取子物体自身的 AABB (Local Space)
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
      childBox.copy(child.geometry.boundingBox!)

      // B. 将子物体 AABB 的 8 个顶点转为世界坐标，再转为父级局部坐标
      // 这一步是数学核心：我们不能直接转换 Box，必须转换 Box 的顶点才准确
      
      // 设定 8 个顶点坐标
      const min = childBox.min
      const max = childBox.max
      corners[0].set(min.x, min.y, min.z)
      corners[1].set(min.x, min.y, max.z)
      corners[2].set(min.x, max.y, min.z)
      corners[3].set(min.x, max.y, max.z)
      corners[4].set(max.x, min.y, min.z)
      corners[5].set(max.x, min.y, max.z)
      corners[6].set(max.x, max.y, min.z)
      corners[7].set(max.x, max.y, max.z)

      for (let i = 0; i < 8; i++) {
        // Child Local -> World -> Parent Local
        corners[i].applyMatrix4(child.matrixWorld).applyMatrix4(inverseMatrix)
        // 撑大父级局部包围盒
        localBox.expandByPoint(corners[i])
      }
    }
  })

  if (!hasMesh || localBox.isEmpty()) {
    boxState.value.visible = false
    return
  }

  // 5. 计算最终的局部中心和尺寸
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  localBox.getSize(size)
  localBox.getCenter(center)

  // 6. 更新 UI
  // 这里的妙处在于：
  // 外层 Group 直接使用 :matrix="parent.matrixWorld"，这意味着它完全同步了父物体的位移、旋转和缩放。
  // 内层 Mesh 只需要设置相对于父物体的 center (偏移) 和 size (大小)。
  boxState.value = {
    parentMatrix: parent.matrixWorld.clone(), // 必须 clone，否则引用会被后续修改破坏
    position: [center.x, center.y, center.z],
    scale: [size.x * 1.005, size.y * 1.005, size.z * 1.005], // 微调防闪烁
    visible: true
  }
})
</script>

<template>
  <TresGroup 
    v-if="boxState.visible"
    :matrix-auto-update="false"
    :matrix="boxState.parentMatrix"
  >
    <TresMesh 
      :position="boxState.position"
      :scale="boxState.scale"
    >
      <TresBoxGeometry :args="[1, 1, 1]" />
      
      <TresMeshBasicMaterial 
        color="#ffd700" 
        :transparent="true" 
        :opacity="0.15"
        :depth-test="true"
        :side="THREE.DoubleSide"
      />

      <TresLineSegments>
        <TresEdgesGeometry :args="[new THREE.BoxGeometry(1, 1, 1)]" />
        <TresLineBasicMaterial color="#ffd700" :depth-test="false" />
      </TresLineSegments>
    </TresMesh>
  </TresGroup>
</template>