<script setup lang="ts">
import { shallowRef, watch, inject, computed } from 'vue'
import * as Vue from 'vue'
import { loadModule } from 'vue3-sfc-loader'
import { FileSystem } from '../engine/FileSystem'
import { useUIStore } from '@renderer/composables/useUIStore'


const { state } = useUIStore()

const props = defineProps<{
  src: string
  nodeId: string
}>()

const componentRef = shallowRef<any>(null)
// 🟢 注意：这个组件是在 ViewportPlayer 下渲染的，所以能 Inject 到 project-root 和 registry
const projectRoot = inject('project-root') as any
const registry = inject<any>('scene-registry')
// 获取节点实例，传给子组件
const currentNode = registry?.get(props.nodeId)

const options = {
  moduleCache: { vue: Vue },
  async getFile(url: string) {
    if (!projectRoot?.value) return ''
    const fullPath = await FileSystem.pathJoin(projectRoot.value, url)
    const res = await FileSystem.readFile(fullPath)
    return res.data || ''
  },
  addStyle(textContent: string) {
    const style = document.createElement('style')
    style.textContent = textContent
    document.head.appendChild(style)
  },
}

const uiData = computed(() => {
  const item = state.items.find(i => i.id === props.nodeId)
  return item ? item.data : {}
})

watch(() => props.src, async (path) => {
  if (!path || !projectRoot?.value) return
  try {
    componentRef.value = await loadModule(path, options)
  } catch (e) {
    console.error(`[DynamicVue] Load failed: ${path}`, e)
  }
}, { immediate: true })
</script>

<template>
  <div class="dynamic-ui-wrapper">
    <component 
      v-if="componentRef && currentNode" 
      :is="componentRef" 
      :node="currentNode"
      :data="uiData" 
    />
  </div>
</template>

<style scoped>
.dynamic-ui-wrapper {
  pointer-events: auto; /* 开启交互 */
}
</style>