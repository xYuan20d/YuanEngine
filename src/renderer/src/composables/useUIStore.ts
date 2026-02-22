// src/composables/useUIStore.ts
import { reactive } from 'vue'

interface UIItem {
  id: string
  src: string
  nodeId: string
  data: Record<string, any>
  // 🟢 新增：可见性状态
  visible: boolean 
}

const state = reactive({
  items: [] as UIItem[]
})

export const useUIStore = () => {
  // 1. 修改 add：初始化时接受 visible
  const add = (nodeId: string, src: string, visible: boolean = true) => {
    const existing = state.items.find(i => i.id === nodeId)
    if (existing) {
      if (existing.src !== src) existing.src = src
      // 更新可见性
      existing.visible = visible
    } else {
      state.items.push({ 
        id: nodeId, 
        nodeId, 
        src, 
        data: {},
        visible // 初始化
      })
    }
  }

  const remove = (nodeId: string) => {
    const idx = state.items.findIndex(i => i.id === nodeId)
    if (idx !== -1) state.items.splice(idx, 1)
  }

  // 2. 新增：单独控制可见性的 API
  const setVisible = (nodeId: string, visible: boolean) => {
    const item = state.items.find(i => i.id === nodeId)
    if (item) {
      item.visible = visible
    }
  }

  // updateData 保持不变...
  const updateData = (nodeId: string, payload: Record<string, any>) => {
    const item = state.items.find(i => i.id === nodeId)
    if (item) Object.assign(item.data, payload)
  }

  return { state, add, remove, updateData, setVisible }
}