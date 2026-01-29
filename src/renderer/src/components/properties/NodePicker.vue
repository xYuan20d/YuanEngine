<script setup lang="ts">
import { computed, inject, ref, Ref } from 'vue' // 🟢 引入 Ref 类型
import { IGameNode } from '../../types/schema'

const props = defineProps<{
  value: string | null // node-id
  label?: string
}>()

const emit = defineEmits(['update:value'])

// 🟢 核心修复 1: 正确声明类型为 Ref<Map>
// App.vue provide 的是 computed，所以接收方拿到的是 Ref
const allNodesMap = inject<Ref<Map<string, IGameNode>>>('nodes-map')

const isDragOver = ref(false)

const displayLabel = computed(() => {
  if (!props.value) return 'None (Game Object)'
  
  // 🟢 核心修复 2: 必须访问 .value 才能拿到 Map
  // 加上防御性代码，防止 inject 失败导致崩溃
  const map = allNodesMap?.value
  if (!map) return 'Loading...'
  
  const node = map.get(props.value)
  return node ? `📄 ${node.name}` : `❌ Missing (${props.value.slice(0,5)}...)`
})

const onDragOver = (e: DragEvent) => {
  e.preventDefault() 
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
    isDragOver.value = true
  }
}

const onDragLeave = () => {
  isDragOver.value = false
}

const onDrop = (e: DragEvent) => {
  isDragOver.value = false
  const nodeId = e.dataTransfer?.getData('node-id')
  
  if (nodeId) {
    // 🟢 防止自己拖给自己 (虽然 NodePicker 不容易发生，但为了安全)
    if (nodeId === props.value) return;

    console.log('[NodePicker] Dropped Node ID:', nodeId)
    emit('update:value', nodeId)
  }
}

const onClear = () => {
  emit('update:value', null)
}
</script>

<template>
  <div class="node-picker">
    <div 
      class="picker-box"
      :class="{ 'has-value': !!value, 'drag-hover': isDragOver }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
      title="Drag a node from Hierarchy here"
    >
      <span class="node-name">{{ displayLabel }}</span>
      <span v-if="value" class="remove-btn" @click.stop="onClear">×</span>
    </div>
  </div>
</template>

<style scoped>
.node-picker {
  display: flex;
  align-items: center;
  width: 100%;
  font-family: 'Segoe UI', sans-serif;
}

.label {
  width: 80px; 
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-transform: capitalize;
  margin-right: 4px;
}

.picker-box {
  flex: 1;
  background: #f5f7fa; 
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  padding: 4px 8px;
  color: #999;
  font-size: 11px;
  cursor: default;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
  min-height: 22px;
  /* 防止文字过长撑开 */
  overflow: hidden; 
}

.picker-box.drag-hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.picker-box.has-value {
  color: #333;
  border-color: #a0cfff;
  background: #e6f7ff;
  font-weight: 500;
}

.node-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.remove-btn {
  cursor: pointer;
  color: #999;
  font-weight: bold;
  font-size: 14px;
  margin-left: 5px;
  line-height: 1;
  flex-shrink: 0;
}
.remove-btn:hover {
  color: #f56c6c;
}
</style>