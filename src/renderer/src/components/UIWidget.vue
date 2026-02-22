<script setup lang="ts">
import { computed, watch, onUnmounted, ref, shallowRef } from 'vue'
import { Html } from '@tresjs/cientos'
import { useUIStore } from '../composables/useUIStore'
import { useDynamicLoader } from '../composables/useDynamicLoader'
import { useTresContext, useLoop } from '@tresjs/core' // 🟢 1. 引入核心 Hook
import * as THREE from 'three'

const props = defineProps<{
  src: string
  nodeId: string 
  visible: boolean
  mode?: 'screen' | 'world'
  resolution?: number
  occlude?: boolean
}>()

// --- 模式 A: Screen UI (保持不变) ---
const { add, remove, setVisible } = useUIStore()
const isScreen = computed(() => props.mode !== 'world')
let timer: any = null

// 🟢 修复 1: 拆分监听器 - 仅针对 src 和 mode 使用防抖
watch(() => [props.src, props.mode], () => {
  if (!isScreen.value) return // World 模式不走这里

  if (timer) clearTimeout(timer)
  
  // 路径变化需要防抖，防止打字时频繁加载
  timer = setTimeout(() => {
    if (props.src) {
      // 加载时带上当前的 visible 状态
      add(props.nodeId, props.src, props.visible) 
    } else {
      remove(props.nodeId)
    }
  }, 500)
}, { immediate: true })

// 🟢 修复 2: 独立监听 visible - 瞬间响应！
watch(() => props.visible, (newVal) => {
  if (!isScreen.value) return // World 模式由 Template 控制

  // ⚡️ 只要可见性变了，立刻通知 Store，0延迟
  setVisible(props.nodeId, newVal)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  remove(props.nodeId)
})

// --- 模式 B: World UI ---
const srcRef = computed(() => props.mode === 'world' ? props.src : '')
const { componentRef, currentNode } = useDynamicLoader(srcRef, props.nodeId)

const { state } = useUIStore()
const uiData = computed(() => {
  const item = state.items.find(i => i.id === props.nodeId)
  return item ? item.data : {}
})

// 默认 0.01 (1px = 1cm)
const scaleFactor = computed(() => props.resolution || 0.01)

// ==========================================
// 🟢 自定义遮挡检测系统 (Manual Occlusion)
// ==========================================

const { scene, camera: activeCamera } = useTresContext()
const { onBeforeRender } = useLoop()

const containerRef = ref<HTMLElement | null>(null) // 拿到 DOM 引用
const groupRef = shallowRef<THREE.Group | null>(null) // 拿到 3D Group 引用

// 缓存变量 (避免 GC)
const raycaster = new THREE.Raycaster()
const uiWorldPos = new THREE.Vector3()
const dir = new THREE.Vector3()

// 每一帧执行检测
onBeforeRender(() => {
  // 1. 只有在 World 模式且开启了遮挡时才计算
  if (isScreen.value || !props.occlude || !groupRef.value || !activeCamera.value || !containerRef.value) {
    // 如果关闭遮挡或条件不满足，强制显示
    if (containerRef.value) containerRef.value.style.opacity = '1'
    return
  }

  const cam = activeCamera.value
  const uiGroup = groupRef.value

  // 2. 获取位置向量
  uiGroup.getWorldPosition(uiWorldPos) // UI 在世界中的位置
  
  // 3. 准备射线: Camera -> UI
  dir.subVectors(uiWorldPos, cam.position)
  const distanceToUI = dir.length()
  dir.normalize()

  raycaster.set(cam.position, dir)
  // 稍微缩短一点射线，防止射线刚好击中 UI 自己的锚点
  raycaster.far = distanceToUI - 0.5 

  // 4. 🎯 核心：检测碰撞
  // intersectObjects(Array, recursive)
  // 我们检测整个场景，但是要过滤掉乱七八糟的东西
  const intersects = raycaster.intersectObject(scene.value, true)

  let isBlocked = false

  for (const hit of intersects) {
    const obj = hit.object

    // --- 🛡️ 智能过滤规则 (白名单/黑名单) ---
    
    // A. 忽略不可见物体
    if (!obj.visible) continue
    
    // B. 忽略辅助线和 Gizmo (通常没有 userData.id 或者 type 是 LineSegments)
    // 你的 GameEntity 都有 userData.id，这是区分“游戏物体”和“编辑器杂项”的黄金标准
    if (!obj.userData || (!obj.userData.id && !obj.userData.isGameEntity)) {
      // 也可以根据 name 过滤，比如 GridHelper, SelectionBox
      continue 
    }

    // C. 忽略自己 (UI 挂载的父节点)
    // 如果射线击中了 UI 挂载的那个物体，通常不算遮挡（因为 UI 本来就是贴在它身上的）
    if (obj.userData.id === props.nodeId) continue

    // D. 忽略透明物体 (可选，看需求)
    // if (obj.material && obj.material.transparent && obj.material.opacity < 0.1) continue

    // --- 💥 真的撞到了障碍物 ---
    // 因为我们设置了 raycaster.far = distanceToUI，所以只要能进到这里，
    // 说明障碍物一定在 相机 和 UI 之间。
    isBlocked = true
    // console.log('Blocked by:', obj.name) // 调试用
    break 
  }

  // 5. 应用结果 (使用 CSS Opacity 实现柔和过渡)
  // 使用 lerp 插值可以让闪烁更少，这里直接硬切
  containerRef.value.style.opacity = isBlocked ? '0.15' : '1' 
  // 提示：设为 0.15 而不是 0，可以在被遮挡时呈现“半透明”效果，像透视挂一样，体验更好！
  // 如果想要完全消失，就设为 '0'
})

</script>

<template>
  <Html
    v-if="!isScreen && componentRef"
    ref="groupRef"
    transform
    :wrapper-class="'world-ui-wrapper'"
    :scale="scaleFactor"
    :occlude="false" 
    :visible="visible"
    :z-index-range="[0, 500]"
    style="pointer-events: none;" 
  >
    <div 
      ref="containerRef" 
      class="world-isolation" 
      style="pointer-events: auto; transition: opacity 0.1s;"
    >
      <component 
        :is="componentRef" 
        :node="currentNode"
        :data="uiData" 
      />
    </div>
  </Html>

  <slot v-else></slot>
</template>

<style scoped>
.world-isolation {
  /* 基础重置 */
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  
  font-family: 'Segoe UI', sans-serif;
  font-size: 16px; 
  color: white;
  user-select: none;
  
  width: max-content;
  height: max-content;
}

/* 强制重置子元素定位 */
:deep(.world-isolation > *) {
  position: static !important;
  transform: none !important;
  margin: 0 !important;
  left: auto !important;
  top: auto !important;
  bottom: auto !important;
  right: auto !important;
}
</style>