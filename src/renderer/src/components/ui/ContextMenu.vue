<script setup lang="ts">
import { h, defineComponent, onMounted, onUnmounted, ref, watch, nextTick, reactive } from 'vue'
import { useContextMenu, MenuItem } from '../../composables/useContextMenu'

const { visible, position, hideContextMenu, menuItems } = useContextMenu()

const menuRef = ref<HTMLElement | null>(null)
const menuStyle = reactive({
  top: '0px',
  left: '0px',
  visibility: 'hidden' as 'visible' | 'hidden'
})

// -------------------------------------------------------------------------
// 核心组件：递归菜单列表
// -------------------------------------------------------------------------
const MenuList = defineComponent({
  name: 'MenuList',
  props: ['items'],
  setup(props) {
    const activeIndex = ref<number | null>(null)
    let closeTimer: any = null

    const handleItemEnter = (index: number, e: MouseEvent) => {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
      activeIndex.value = index
      
      const target = e.currentTarget as HTMLElement
      const submenu = target.querySelector('.submenu') as HTMLElement
      if (submenu && !target.classList.contains('disabled')) {
        positionSubmenu(target, submenu)
      }
    }

    const handleItemLeave = () => {
      closeTimer = setTimeout(() => { activeIndex.value = null }, 200)
    }

    const positionSubmenu = (parent: HTMLElement, submenu: HTMLElement) => {
      submenu.classList.remove('submenu-left', 'submenu-up')
      const originalDisplay = submenu.style.display
      submenu.style.display = 'block'
      submenu.style.visibility = 'hidden'
      
      const rect = parent.getBoundingClientRect()
      const submenuRect = submenu.getBoundingClientRect()
      
      submenu.style.display = originalDisplay
      submenu.style.visibility = ''

      if (rect.right + submenuRect.width > window.innerWidth) submenu.classList.add('submenu-left')
      if (rect.top + submenuRect.height > window.innerHeight) submenu.classList.add('submenu-up')
    }

    return () => h('ul', { class: 'context-menu-list' }, props.items.map((item: MenuItem, index: number) => {
      if (item.separator) return h('li', { class: 'separator' })
      
      const isActive = activeIndex.value === index
      const hasChildren = !!(item.children && item.children.length > 0)

      return h('li', { 
        class: ['menu-item', { 
          disabled: item.disabled, 
          'has-submenu': hasChildren,
          'is-active': isActive
        }],
        // 【关键】传入 index 变量，但我们这次通过 CSS 计算更明显的延迟
        style: { '--i': index } as any, 
        
        onMouseenter: (e: MouseEvent) => handleItemEnter(index, e),
        onMouseleave: handleItemLeave,
        onClick: (e: MouseEvent) => {
          if (item.disabled) return
          e.stopPropagation()
          if (!hasChildren && item.action) {
            item.action()
            hideContextMenu()
          }
        }
      }, [
        h('div', { class: 'label-container' }, [
           item.icon && h('span', { class: 'icon' }, item.icon),
           h('span', item.label)
        ]),
        hasChildren && h('span', { class: 'arrow' }, '▶'),
        hasChildren && h('div', { 
          class: 'submenu',
          style: { display: isActive ? 'block' : 'none' } 
        }, h(MenuList, { items: item.children }))
      ])
    }))
  }
})

// -------------------------------------------------------------------------
// 根级定位逻辑
// -------------------------------------------------------------------------
watch(visible, async (val) => {
  if (val) {
    // 每次显示时，先重置样式确保动画能重新触发（Vue 的 v-if 会自动处理 DOM重建，这通常足够）
    menuStyle.top = `${position.y}px`
    menuStyle.left = `${position.x}px`
    menuStyle.visibility = 'hidden'

    await nextTick()
    
    if (menuRef.value) {
      const rect = menuRef.value.getBoundingClientRect()
      let newX = position.x
      let newY = position.y

      if (newX + rect.width > window.innerWidth) newX -= rect.width
      if (newX < 0) newX = window.innerWidth - rect.width - 10
      if (newY + rect.height > window.innerHeight) newY -= rect.height
      if (newY < 0) newY = window.innerHeight - rect.height - 10

      menuStyle.left = `${newX}px`
      menuStyle.top = `${newY}px`
      menuStyle.visibility = 'visible'
    }
  }
})

const onClickOutside = () => { if (visible.value) hideContextMenu() }
onMounted(() => window.addEventListener('click', onClickOutside))
onUnmounted(() => window.removeEventListener('click', onClickOutside))
</script>

<template>
  <div 
    ref="menuRef"
    v-if="visible" 
    class="context-menu-overlay" 
    :style="menuStyle"
    @contextmenu.prevent
  >
    <MenuList :items="menuItems" />
  </div>
</template>

<style>
/* --------------------------
   容器：舞台
--------------------------- */
.context-menu-overlay {
  position: fixed;
  z-index: 9999;
  
  /* 外观：Win11 亚克力/云母效果 */
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px); 
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  
  min-width: 180px;
  padding: 6px;
  font-family: 'Segoe UI', sans-serif;
  font-size: 14px;
  color: #333;
  user-select: none;
  
  /* 【容器动画】快速展开一个空盒子 */
  /* 这里的 clip-path 实现了从上往下拉开帷幕的效果，比 scale 更像“展开” */
  animation: menuExpand 0.25s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
  transform-origin: top left;
  will-change: clip-path, opacity;
}

/* --------------------------
   列表项：演员
--------------------------- */
.context-menu-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.menu-item {
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  transition: background 0.1s;
  
  /* 【关键点1】初始状态必须完全透明，否则会先闪一下 */
  opacity: 0;
  
  /* 【关键点2】动画执行逻辑 */
  /* forwards 确保动画结束后停留在最终状态(opacity:1) */
  animation: itemSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  
  /* 【关键点3】交错延迟计算 */
  /* 0.1s: 基础等待时间。等容器展开 100ms 后，第一项才开始动。
     var(--i) * 0.05s: 每一项之间间隔 50ms (之前是30ms，太快了)。
  */
  animation-delay: calc(0.1s + var(--i) * 0.05s);
}

.menu-item:hover, .menu-item.is-active {
  background-color: rgba(0, 0, 0, 0.05);
}
.menu-item.disabled { color: #aaa; pointer-events: none; }

/* --------------------------
   子菜单：嵌套舞台
--------------------------- */
.submenu {
  display: none;
  position: absolute;
  left: 100%;
  top: -6px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  min-width: 160px;
  padding: 6px;
  z-index: 100;
  margin-left: 4px;
  
  /* 子菜单本身也要有个展开动作 */
  animation: menuExpand 0.2s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
  transform-origin: top left;
}

/* 隐形桥 */
.submenu::before {
  content: ''; position: absolute; top: 0; bottom: 0; left: -20px; width: 20px;
}

/* --------------------------
   动画关键帧
--------------------------- */

/* 容器展开：像卷轴一样打开，或者从中心变大 */
@keyframes menuExpand {
  0% {
    opacity: 0;
    transform: scaleY(0.5) scaleX(0.9); /* 初始压扁一点 */
  }
  100% {
    opacity: 1;
    transform: scaleY(1) scaleX(1);
  }
}

/* 每一项滑入：从左侧轻微滑入 + 淡入 */
@keyframes itemSlideIn {
  0% {
    opacity: 0;
    transform: translateX(-10px); /* 从左边一点点滑过来 */
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

/* --------------------------
   通用样式
--------------------------- */
.label-container { display: flex; align-items: center; }
.icon { margin-right: 10px; width: 16px; text-align: center; }
.separator { height: 1px; background: #eee; margin: 4px 10px; }
.arrow { font-size: 10px; color: #999; margin-left: 10px; }

.submenu.submenu-left { left: auto; right: 100%; margin-left: 0; margin-right: 4px; }
.submenu.submenu-left::before { left: auto; right: -20px; }
.submenu.submenu-up { top: auto; bottom: -6px; transform-origin: bottom left; }
</style>