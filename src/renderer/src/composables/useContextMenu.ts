// src/composables/useContextMenu.ts
import { ref, reactive } from 'vue'

export interface MenuItem {
  label?: string
  icon?: string
  shortcut?: string
  disabled?: boolean
  separator?: boolean
  // 子菜单 (折叠项)
  children?: MenuItem[] 
  // 点击回调
  action?: () => void
}

// 全局状态 (单例模式)
const visible = ref(false)
const position = reactive({ x: 0, y: 0 })
const menuItems = ref<MenuItem[]>([])

export function useContextMenu() {
  
  const showContextMenu = (e: MouseEvent, items: MenuItem[]) => {
    e.preventDefault() // 阻止系统默认右键
    e.stopPropagation()
    
    visible.value = true
    menuItems.value = items
    
    // 简单的位置计算，防止超出屏幕右下角 (进阶做法可以用 floating-ui 库)
    position.x = e.clientX
    position.y = e.clientY
  }

  const hideContextMenu = () => {
    visible.value = false
  }

  return {
    visible,
    position,
    menuItems,
    showContextMenu,
    hideContextMenu
  }
}