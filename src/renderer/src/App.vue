<script setup lang="ts">
import { ref, computed, provide, onMounted } from 'vue'
import ContextMenu from './components/ui/ContextMenu.vue'
import GameViewport from './components/GameViewport.vue'
import HierarchyPanel from './components/HierarchyPanel.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import { IGameNode } from './types/schema'

const projectRoot = ref<string | null>(null) // 当前项目的根目录路径

provide('project-root', projectRoot)

onMounted(() => {
  window.fileSystem.onRequestSave(async () => {
    
    // 序列化当前场景数据
    const data = JSON.stringify(sceneNodes.value, null, 2)
    
    // 🔴 情况 A：已经有项目了 -> 直接覆盖保存
    if (projectRoot.value) {
      const res = await window.fileSystem.saveProject(projectRoot.value, data)
      if (res.success) {
        console.log('✅ Project saved!')
        // 这里可以加个 toast 提示 "保存成功"
      } else {
        console.error('Save failed:', res.error)
      }
    } 
    // 🟢 情况 B：还没有项目 (新建的) -> 触发“另存为”流程
    else {
      console.log('⚠️ No project root, triggering Save As...')
      
      const res = await window.fileSystem.saveProjectAs(data)
      
      if (res.success && res.path) {
        // 保存成功后，直接“变成”打开状态
        projectRoot.value = res.path
        document.title = `YuanEngine - ${res.path}`
        console.log('✅ New project created at:', res.path)
        alert(`项目已创建于：${res.path}\n请将你的 JS 脚本放入该目录下的 scripts 文件夹中。`)
      } else if (!res.canceled) {
        console.error('Save As failed:', res.error)
      }
    }
  })

  // 2. 处理打开项目 (来自菜单栏 Cmd+O)
  window.fileSystem.onProjectOpened(async (path: string) => {
    console.log('📂 Opening project:', path)
    
    // 读取 project.json
    const res = await window.fileSystem.loadProject(path)
    
    if (res.success) {
      try {
        // 反序列化并替换当前场景
        const nodes = JSON.parse(res.data)
        sceneNodes.value = nodes
        projectRoot.value = path // 设置根目录
        
        // 重置选中状态
        currentSelection.value = null
        document.title = `YuanEngine - ${path}`
      } catch (e) {
        console.error('Invalid project.json', e)
      }
    } else {
      // 如果没有 project.json，我们就认为这是一个新项目，初始化它
      if (confirm('该文件夹没有项目文件，是否初始化为新项目？')) {
        sceneNodes.value = [] // 或者默认场景
        projectRoot.value = path
        document.title = `YuanEngine - ${path}`
      }
    }
  })
})



// --- 查找节点函数 ---
const findNodeRecursive = (nodes: IGameNode[], id: string): IGameNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeRecursive(node.children, id)
      if (found) return found
    }
  }
}

// --- 删除节点函数（需要查找父节点）---
const deleteNodeRecursive = (nodes: IGameNode[], id: string): boolean => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      nodes.splice(i, 1)
      return true
    }
    if (nodes[i].children) {
      const deleted = deleteNodeRecursive(nodes[i].children!, id)
      if (deleted) return true
    }
  }
  return false
}

const hasMainCamera = (nodes: IGameNode[]): boolean => {
  for (const node of nodes) {
    const cam = node.components.find(c => c.type === 'Camera' && c.props.isMain)
    if (cam) return true
    if (node.children && hasMainCamera(node.children)) return true
  }
  return false
}

// --- 添加节点函数（升级版：支持指定父节点）---
const addNode = (type: 'Mesh' | 'Light' | 'Camera', subtype: string, parentId?: string) => {
  const id = 'node_' + Date.now()
  
  // 创建新节点数据
  const newNode: IGameNode = {
    id,
    name: `New ${subtype}`,
    active: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    components: [],
    children: [] // 必须初始化 children 数组
  }

  if (type === 'Camera') {
    // 检查当前场景是否已经有主摄像机
    const alreadyHasMain = hasMainCamera(sceneNodes.value)
    
    newNode.components.push({
      type: 'Camera',
      props: {
        isMain: !alreadyHasMain, // 如果没有主摄，我就是主摄
        fov: 60,
        near: 0.1,
        far: 1000
      }
    })
    newNode.name = 'Camera'
  }
  // 根据类型填充组件
  else if (type === 'Mesh') {
    if (subtype === 'Empty') {
      // 空物体没有 Mesh 组件
      newNode.name = 'New Empty'
    } else {
      if (subtype === 'Empty') {
      newNode.name = 'New Empty'
    } else {
      // 🟢 核心修复开始
      let defaultArgs = [1, 1, 1] // 默认给 Box 用

      if (subtype === 'Sphere') {
        // 球体参数: [半径, 水平分段数, 垂直分段数]
        // 32 和 16 是比较标准的"看起来像圆"的数值
        defaultArgs = [1, 32, 16] 
      } else if (subtype === 'Plane') {
        // 平面参数: [宽, 高]
        defaultArgs = [2, 2] 
      }
      
      newNode.components.push({
        type: 'Mesh',
        props: { geometry: subtype, args: defaultArgs, color: '#ffffff' }
      })
      // 🟢 核心修复结束
    }
  }
  } else if (type === 'Light') {
    newNode.components.push({
      type: 'Light',
      props: { intensity: 1, color: '#ffffff' }
    })
  }

  // 核心逻辑：判断是插入根节点还是子节点
  if (parentId) {
    // 查找父节点
    const parent = findNodeRecursive(sceneNodes.value, parentId)
    if (parent) {
      // 确保父节点的 children 数组存在
      if (!parent.children) parent.children = []
      parent.children.push(newNode)
      
      console.log(`[Engine] Added ${newNode.name} as child of ${parent.name}`)
    } else {
      console.warn(`[Engine] Parent ${parentId} not found, adding to root.`)
      sceneNodes.value.push(newNode)
    }
  } else {
    // 没有 parentId，默认添加到根目录
    sceneNodes.value.push(newNode)
    console.log(`[Engine] Added ${newNode.name} to root`)
  }
}

// --- 删除节点函数 ---
const deleteNode = (id: string) => {
  // 如果删除的是当前选中的节点，清空选中状态
  if (currentSelection.value === id) {
    currentSelection.value = null
  }
  
  // 递归删除节点
  const deleted = deleteNodeRecursive(sceneNodes.value, id)
  if (deleted) {
    console.log(`[Engine] Deleted node ${id}`)
  } else {
    console.warn(`[Engine] Node ${id} not found for deletion`)
  }
}

// 提供编辑器动作给子组件
provide('editor-actions', { addNode, deleteNode })

// 【新增】计算出当前选中的 Node 对象
// 这样 InspectorPanel 就能直接拿到对象进行修改，利用 Vue 的引用特性实现双向绑定
const selectedNode = computed(() => {
  if (!currentSelection.value) return null
  return findNodeRecursive(sceneNodes.value, currentSelection.value)
})

// --- 数据部分 ---
const sceneNodes = ref<IGameNode[]>([
  {
    id: 'root_1',
    name: 'Player',
    active: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    components: [
      { type: 'Mesh', props: { geometry: 'Box', args: [1, 2, 1], color: '#409eff' } }
    ],
    children: [
      {
        id: 'child_1',
        name: 'Head',
        active: true,
        position: [0, 1.5, 0], 
        rotation: [0, 0, 0],
        scale: [0.5, 0.5, 0.5],
        components: [
          { type: 'Mesh', props: { geometry: 'Sphere', args: [1], color: '#f56c6c' } }
        ],
        children: [] 
      }
    ]
  }
])

const currentSelection = ref<string | null>(null)
const currentTool = ref<'translate' | 'rotate' | 'scale'>('translate')
const isPlaying = ref(false) // [新增] 运行状态

// 切换运行状态
const togglePlay = () => {
  isPlaying.value = !isPlaying.value
  // 切换时取消选中，避免 Gizmo 在运行时干扰
  if (isPlaying.value) {
    currentSelection.value = null
  }
}

// --- 查找与更新逻辑 ---
const handleUpdate = (id: string, newTrans: any) => {
  const node = findNodeRecursive(sceneNodes.value, id)
  if (node) {
    node.position = newTrans.position
    node.rotation = newTrans.rotation
    node.scale = newTrans.scale
  }
}

// --- 核心：面板拖拽逻辑 ---
const leftWidth = ref(260)
const rightWidth = ref(280)
const isResizing = ref(false) // 用于在拖拽时给 body 加样式，防止选中文字

// 临时状态
let startX = 0
let startWidth = 0
let activePanel: 'left' | 'right' | null = null

const startResize = (panel: 'left' | 'right', e: MouseEvent) => {
  isResizing.value = true
  activePanel = panel
  startX = e.clientX
  startWidth = panel === 'left' ? leftWidth.value : rightWidth.value
  
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', stopResize)
  // 防止 iframe (如果有) 捕获鼠标事件
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

const onMouseMove = (e: MouseEvent) => {
  if (!activePanel) return
  const dx = e.clientX - startX
  
  if (activePanel === 'left') {
    // 左侧：往右拉变宽
    const newW = startWidth + dx
    if (newW > 150 && newW < 500) leftWidth.value = newW
  } else {
    // 右侧：往右拉变窄 (因为是从右边缘算起，或者是 flex 布局逻辑)
    // 实际上我们在 flex 布局中，右侧面板在右边。
    // 鼠标往左移 (dx 为负)，宽度应该增加。
    const newW = startWidth - dx
    if (newW > 200 && newW < 600) rightWidth.value = newW
  }
}

const stopResize = () => {
  isResizing.value = false
  activePanel = null
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}
</script>

<template>
  <div class="editor-shell">
    <div class="main-layout">
      
      <div class="panel-wrapper" :style="{ width: leftWidth + 'px' }">
        <HierarchyPanel 
          :nodes="sceneNodes" 
          :selected-id="currentSelection"
          :is-playing="isPlaying"
          @select="(id) => currentSelection = id"
        />
      </div>

      <div class="resizer" @mousedown="(e) => startResize('left', e)"></div>

      <div class="workspace">
        <div class="viewport-window">
          <div class="floating-toolbar">
             <div class="tool-btn-group">
                <button 
                  :class="{ active: isPlaying, 'play-btn': true }"
                  style="font-weight: bold; color: #42b883;"
                  @click="togglePlay"
                >
                  {{ isPlaying ? '⏹ Stop' : '▶ Play' }}
                </button>
                <div style="width: 1px; height: 16px; background: #ddd; margin: 0 8px;"></div>
                <button :class="{ active: currentTool === 'translate' }" @click="currentTool = 'translate'">Move</button>
                <button :class="{ active: currentTool === 'rotate' }" @click="currentTool = 'rotate'">Rotate</button>
                <button :class="{ active: currentTool === 'scale' }" @click="currentTool = 'scale'">Scale</button>
             </div>
          </div>

          <GameViewport 
            :scene-data="sceneNodes"
            :selected-id="currentSelection"
            :is-playing="isPlaying"
            :tool-mode="currentTool"
            @select="(id) => currentSelection = id"
            @update:transform="handleUpdate"
          />
        </div>
      </div>

      <div class="resizer" @mousedown="(e) => startResize('right', e)"></div>

      <div class="panel-wrapper" :style="{ width: rightWidth + 'px' }">
        <InspectorPanel 
          :node="selectedNode" 
          :is-playing="isPlaying"
        />
      </div>

    </div>
    
    <!-- ContextMenu 应该放在最外层 -->
    <ContextMenu />
  </div>
</template>

<style scoped>
.editor-shell {
  display: flex; 
  flex-direction: column; 
  height: 100vh;
  background-color: #f5f7fa; 
  color: #333; 
  overflow: hidden;
}

.main-layout {
  display: flex; 
  flex: 1; 
  overflow: hidden;
  /* 移除之前的 min-width，改用更灵活的控制 */
}

/* 面板容器 */
.panel-wrapper {
  background: #fff;
  display: flex; 
  flex-direction: column;
  flex-shrink: 0; /* 关键：禁止被 Flex 压缩 */
}

/* 拖拽手柄 */
.resizer {
  width: 4px; /* 实际可见宽度很细，但点击区域要大一点 */
  background: transparent;
  cursor: col-resize;
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  transition: background 0.2s;
}

/* 给个伪元素做视觉分割线，更精致 */
.resizer::after {
  content: ''; 
  position: absolute; 
  top: 0; 
  bottom: 0; 
  left: 0; 
  width: 1px;
  background: #e0e0e0;
}

.resizer:hover { 
  background: #42b883; 
}

.resizer:hover::after { 
  background: transparent; 
}

.workspace {
  flex: 1; 
  min-width: 0; 
  background-color: #eaeff2;
  position: relative;
  display: flex;
}

/* 视口容器 */
.viewport-window {
  width: 100%; 
  height: 100%;
  position: relative;
  /* 稍微改一下，让视口完全撑满中间，不要圆角和阴影了，更像专业软件 */
}

/* 悬浮工具栏 (替代 Header) */
.floating-toolbar {
  position: absolute; 
  top: 10px; 
  left: 50%; 
  transform: translateX(-50%);
  z-index: 20;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px; 
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(0,0,0,0.05);
}

.tool-btn-group {
  display: flex;
  align-items: center;
}

.tool-btn-group button {
  background: transparent; 
  border: none; 
  padding: 6px 12px;
  cursor: pointer; 
  font-size: 12px; 
  border-radius: 6px; 
  color: #555; 
  font-weight: 500;
  margin: 0 2px;
}

.tool-btn-group button:hover { 
  background: rgba(0,0,0,0.05); 
}

.tool-btn-group button.active { 
  background: #333; 
  color: #fff; 
}

.tool-btn-group .play-btn.active {
  background: rgba(66, 184, 131, 0.15);
  color: #42b883;
}
</style>