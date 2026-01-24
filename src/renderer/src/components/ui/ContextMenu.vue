<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useContextMenu, MenuItem } from '../../composables/useContextMenu'

const { visible, position, menuItems, hideContextMenu } = useContextMenu()

// 点击外部关闭菜单
const onClickOutside = () => {
  if (visible.value) hideContextMenu()
}

// 简单的组件内部递归组件，用于渲染子菜单
const MenuList = defineComponent({
  name: 'MenuList',
  props: ['items'],
  setup(props) {
    return () => h('ul', { class: 'context-menu-list' }, props.items.map((item: MenuItem) => {
      if (item.separator) return h('li', { class: 'separator' })
      
      return h('li', { 
        class: ['menu-item', { disabled: item.disabled, 'has-submenu': item.children }],
        onClick: (e: MouseEvent) => {
          if (item.disabled) return
          e.stopPropagation() // 防止点击子菜单触发外部关闭
          if (item.action) {
            item.action()
            hideContextMenu()
          }
        }
      }, [
        h('div', { class: 'label-container' }, [
           item.icon && h('span', { class: 'icon' }, item.icon),
           h('span', item.label)
        ]),
        item.children && h('span', { class: 'arrow' }, '▶'),
        // 递归渲染子菜单
        item.children && h('div', { class: 'submenu' }, h(MenuList, { items: item.children }))
      ])
    }))
  }
})

// 引入 h 和 defineComponent 是为了在单文件组件里写递归方便，
// 也可以拆分成两个 .vue 文件
import { h, defineComponent } from 'vue'

onMounted(() => window.addEventListener('click', onClickOutside))
onUnmounted(() => window.removeEventListener('click', onClickOutside))
</script>

<template>
  <div 
    v-if="visible" 
    class="context-menu-overlay" 
    :style="{ top: position.y + 'px', left: position.x + 'px' }"
    @contextmenu.prevent
  >
    <MenuList :items="menuItems" />
  </div>
</template>

<style>
/* 全局样式，方便递归组件调用 */
.context-menu-overlay {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 160px;
  padding: 4px 0;
  font-family: 'Segoe UI', sans-serif;
  font-size: 13px;
  color: #333;
}

.context-menu-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.menu-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  transition: background 0.1s;
}

.menu-item:hover {
  background-color: #f0f2f5;
  color: #409eff;
}

.menu-item.disabled {
  color: #bbb;
  cursor: not-allowed;
}
.menu-item.disabled:hover { background: none; color: #bbb; }

.label-container { display: flex; align-items: center; }
.icon { margin-right: 8px; font-size: 14px; width: 16px; text-align: center; }
.separator { height: 1px; background: #eee; margin: 4px 0; }
.arrow { font-size: 8px; color: #999; margin-left: 10px;}

/* 子菜单悬停显示逻辑 */
.submenu {
  display: none;
  position: absolute;
  left: 100%;
  top: -4px; /* 微调对齐 */
  margin-left: 2px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 140px;
  padding: 4px 0;
}

.menu-item:hover > .submenu {
  display: block;
}
</style>