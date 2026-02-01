<script setup lang="ts">
import { ref, computed, provide, onMounted, nextTick } from 'vue'
import ContextMenu from './components/ui/ContextMenu.vue'
import GameViewport from './components/GameViewport.vue'
import HierarchyPanel from './components/HierarchyPanel.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import BottomPanel from './components/BottomPanel.vue'
import { IGameNode } from './types/schema'
import { Cloner } from './engine/Cloner'
import { FileSystem } from './engine/FileSystem'
import * as THREE from 'three'

// 辅助：从 JSON 数据递归计算某节点的世界矩阵
const computeWorldMatrix = (nodeId: string, allNodes: IGameNode[]): THREE.Matrix4 => {
  const stack: IGameNode[] = []
  
  // 1. 向上查找路径 (回溯法)
  const findPath = (nodes: IGameNode[], targetId: string, path: IGameNode[]): boolean => {
    for (const node of nodes) {
      path.push(node)
      if (node.id === targetId) return true
      if (node.children && findPath(node.children, targetId, path)) return true
      path.pop()
    }
    return false
  }

  if (!findPath(allNodes, nodeId, stack)) {
    return new THREE.Matrix4() // 没找到，返回单位矩阵
  }

  // 2. 从根节点开始，逐级累乘矩阵
  const worldMat = new THREE.Matrix4()
  const localMat = new THREE.Matrix4()
  const tempPos = new THREE.Vector3()
  const tempQuat = new THREE.Quaternion()
  const tempScale = new THREE.Vector3()

  for (const node of stack) {
    // 构建局部矩阵
    tempPos.set(...node.position)
    // 欧拉角转四元数 (注意 Euler Order，默认 XYZ)
    const euler = new THREE.Euler(node.rotation[0], node.rotation[1], node.rotation[2], 'XYZ')
    tempQuat.setFromEuler(euler)
    tempScale.set(...node.scale)

    localMat.compose(tempPos, tempQuat, tempScale)
    
    // 世界 = 父世界 * 本地
    worldMat.multiply(localMat)
  }

  return worldMat
}

const moveNode = (nodeId: string, newParentId: string | null) => {
  // 1. 找到要移动的节点对象
  const node = findNodeRecursive(sceneNodes.value, nodeId)
  if (!node) return

  // 防止自己拖给自己，或者拖给自己的子孙
  if (nodeId === newParentId) return
  
  // 2. 检查当前移动的节点是否被选中
  // 如果被选中了，先取消选中！这是解决“框不跟手”的关键
  const wasSelected = currentSelection.value === nodeId
  if (wasSelected) {
    currentSelection.value = null
  }

  // 3. 计算节点当前的【世界变换】(在移动前)
  const oldWorldMatrix = computeWorldMatrix(nodeId, sceneNodes.value)

  // 4. 从旧父级中移除
  deleteNodeRecursive(sceneNodes.value, nodeId)

  // 5. 计算新父级的【世界逆矩阵】
  const newParentInverse = new THREE.Matrix4()
  
  if (newParentId) {
    const parentWorldMatrix = computeWorldMatrix(newParentId, sceneNodes.value)
    newParentInverse.copy(parentWorldMatrix).invert()
  }

  // 6. 计算新的局部矩阵
  // NewLocal = Inverse(NewParentWorld) * OldWorld
  const newLocalMatrix = new THREE.Matrix4()
  newLocalMatrix.multiplyMatrices(newParentInverse, oldWorldMatrix)

  // 7. 分解矩阵，应用到节点数据
  const newPos = new THREE.Vector3()
  const newQuat = new THREE.Quaternion()
  const newScale = new THREE.Vector3()
  
  newLocalMatrix.decompose(newPos, newQuat, newScale)

  node.position = [newPos.x, newPos.y, newPos.z]
  const newEuler = new THREE.Euler().setFromQuaternion(newQuat, 'XYZ')
  node.rotation = [newEuler.x, newEuler.y, newEuler.z]
  node.scale = [newScale.x, newScale.y, newScale.z]

  // 8. 插入到新位置
  if (newParentId) {
    const newParent = findNodeRecursive(sceneNodes.value, newParentId)
    if (newParent) {
      if (!newParent.children) newParent.children = []
      newParent.children.push(node)
    }
  } else {
    sceneNodes.value.push(node)
  }
  
  console.log(`[Engine] Moved ${node.name} to ${newParentId || 'Root'} (Auto-converted Transform)`)

  // 9. 恢复选中状态
  // 使用 nextTick 等待 Vue 完成组件的销毁和重建，Three.js 场景图更新完毕
  if (wasSelected) {
    nextTick(() => {
      currentSelection.value = nodeId
    })
  }
}

const projectRoot = ref<string | null>(null) // 当前项目的根目录路径

provide('project-root', projectRoot)

const nodesMap = computed(() => {
  const map = new Map<string, IGameNode>()
  
  const traverse = (nodes: IGameNode[]) => {
    for (const node of nodes) {
      map.set(node.id, node) // 存入 Map
      if (node.children) {
        traverse(node.children)
      }
    }
  }
  
  traverse(sceneNodes.value)
  return map
})

// 注入给所有子组件使用
provide('nodes-map', nodesMap)

onMounted(() => {
  // 监听 Electron 菜单栏的保存请求
  window.fileSystem.onRequestSave(async () => {
    
    const data = JSON.stringify(sceneNodes.value, null, 2)
    
    // A. 覆盖保存
    if (projectRoot.value) {
      const res = await FileSystem.saveProject(projectRoot.value, data)
      if (res.success) {
        console.log('✅ Project saved!')
      } else {
        console.error('Save failed:', res.error)
      }
    } 
    // B. 另存为 (新建项目)
    else {
      const res = await FileSystem.saveProjectAs(data)
      
      if (res.success && res.data && res.data.path) {
        projectRoot.value = res.data.path
        document.title = `YuanEngine - ${res.data.path}`
        alert(`项目已创建于：${res.data.path}\n请将你的 JS 脚本放入该目录下的 scripts 文件夹中。`)
      } else if (res.error) {
        console.error('Save As failed:', res.error)
      }
    }
  })

  // 监听 Electron 菜单栏的打开项目
  window.fileSystem.onProjectOpened(async (path: string) => {
    console.log('📂 Opening project:', path)
    
    // C. 加载项目 (解耦写法)
    try {
      const projectFile = await FileSystem.pathJoin(path, 'project.json')
      const res = await FileSystem.readFile(projectFile)
      
      if (res.success && res.data) {
        // 反序列化
        const nodes = JSON.parse(res.data)
        sceneNodes.value = nodes
        projectRoot.value = path
        
        currentSelection.value = null
        document.title = `YuanEngine - ${path}`
      } else {
        if (confirm('该文件夹没有 project.json，是否初始化为新项目？')) {
          sceneNodes.value = [] 
          projectRoot.value = path
          document.title = `YuanEngine - ${path}`
        }
      }
    } catch (e) {
      console.error('Failed to load project:', e)
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

// --- 添加节点函数 ---
const addNode = (type: 'Mesh' | 'Light' | 'Camera' | 'Empty', subtype: string, parentId?: string) => {
  const id = 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5)
  
  // 1. 基础结构
  const newNode: IGameNode = {
    id,
    name: subtype === 'Empty' ? 'New Empty' : `New ${subtype}`,
    active: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    components: [], 
    children: [] 
  }

  // 2. 根据类型添加组件
  if (type === 'Camera') {
    const alreadyHasMain = hasMainCamera(sceneNodes.value)
    newNode.components.push({
      type: 'Camera',
      props: {
        isMain: !alreadyHasMain,
        fov: 60,
        near: 0.1,
        far: 1000
      }
    })
    newNode.name = 'Camera'
  }
  else if (type === 'Mesh') {
    let defaultArgs = [1, 1, 1] 

    if (subtype === 'Sphere') {
      defaultArgs = [1, 32, 16] 
    } else if (subtype === 'Plane') {
      defaultArgs = [2, 2] 
    }
    
    newNode.components.push({
      type: 'Mesh',
      props: { geometry: subtype, args: defaultArgs, color: '#ffffff' }
    })
  } 
  else if (type === 'Light') {
    newNode.components.push({
      type: 'Light',
      props: { intensity: 1, color: '#ffffff' }
    })
  } 
  else if (type === 'Empty') {
    newNode.name = 'Empty Object' 
  }

  // 3. 插入到场景树
  if (parentId) {
    const parent = findNodeRecursive(sceneNodes.value, parentId)
    if (parent) {
      if (!parent.children) parent.children = []
      parent.children.push(newNode)
    } else {
      sceneNodes.value.push(newNode)
    }
  } else {
    sceneNodes.value.push(newNode)
  }
}

// --- 删除节点函数 ---
const deleteNode = (id: string) => {
  if (currentSelection.value === id) {
    currentSelection.value = null
  }
  const deleted = deleteNodeRecursive(sceneNodes.value, id)
  if (deleted) {
    console.log(`[Engine] Deleted node ${id}`)
  }
}

// 计算出当前选中的 Node 对象
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
const isPlaying = ref(false)

// 切换运行状态
const togglePlay = () => {
  isPlaying.value = !isPlaying.value
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

// --- 核心：面板拖拽逻辑 (升级版) ---
const leftWidth = ref(260)
const rightWidth = ref(280)
const bottomHeight = ref(250) // 🟢 2. 新增底部高度
const isResizing = ref(false)

// 临时状态
let startX = 0
let startY = 0 // 🟢 3. 新增 Y
let startDimension = 0 // "Dimension" 代替 Width，兼容高宽
let activePanel: 'left' | 'right' | 'bottom' | null = null

const startResize = (panel: 'left' | 'right' | 'bottom', e: MouseEvent) => {
  isResizing.value = true
  activePanel = panel
  startX = e.clientX
  startY = e.clientY // 记录 Y

  // 记录初始尺寸
  if (panel === 'left') startDimension = leftWidth.value
  else if (panel === 'right') startDimension = rightWidth.value
  else if (panel === 'bottom') startDimension = bottomHeight.value

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', stopResize)
  
  document.body.style.userSelect = 'none'
  // 🟢 4. 动态光标
  document.body.style.cursor = panel === 'bottom' ? 'row-resize' : 'col-resize'
}

const onMouseMove = (e: MouseEvent) => {
  if (!activePanel) return

  if (activePanel === 'bottom') {
    // 🟢 5. 底部逻辑：鼠标上移 (dy < 0) -> 高度增加
    const dy = e.clientY - startY
    const newH = startDimension - dy
    if (newH > 100 && newH < 800) bottomHeight.value = newH
  } 
  else {
    // 左右逻辑
    const dx = e.clientX - startX
    if (activePanel === 'left') {
      const newW = startDimension + dx
      if (newW > 150 && newW < 500) leftWidth.value = newW
    } else {
      const newW = startDimension - dx
      if (newW > 200 && newW < 600) rightWidth.value = newW
    }
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

// 粘贴板
const internalClipboard = ref<IGameNode | null>(null)
// --- 复制函数 ---
const copyNode = (id: string) => {
  const node = findNodeRecursive(sceneNodes.value, id)
  if (node) {
    internalClipboard.value = JSON.parse(JSON.stringify(node))
    console.log(`[Engine] Copied to clipboard: ${node.name}`)
  }
}

// --- 粘贴函数 ---
const pasteNode = (targetParentId: string | null) => {
  if (!internalClipboard.value) {
    console.warn('[Engine] Clipboard is empty')
    return
  }

  const newNode = Cloner.instantiate(internalClipboard.value)
  newNode.name = `${newNode.name} (Clone)`

  if (targetParentId) {
    const parent = findNodeRecursive(sceneNodes.value, targetParentId)
    if (parent) {
      if (!parent.children) parent.children = []
      parent.children.push(newNode)
    } else {
      sceneNodes.value.push(newNode)
    }
  } else {
    sceneNodes.value.push(newNode)
  }

  console.log(`[Engine] Pasted ${newNode.name} to ${targetParentId || 'Root'}`)

  nextTick(() => {
    currentSelection.value = newNode.id
  })
}

// 提供编辑器动作给子组件
provide('editor-actions', { addNode, deleteNode, moveNode, copyNode, pasteNode })
</script>

<template>
  <div class="editor-shell">
    
    <div class="top-section">
      <div class="main-layout">
        
        <div class="panel-wrapper" :style="{ width: leftWidth + 'px' }">
          <HierarchyPanel 
            :nodes="sceneNodes" 
            :selected-id="currentSelection"
            :is-playing="isPlaying"
            @select="(id) => currentSelection = id"
          />
        </div>

        <div class="resizer col-resizer" @mousedown="(e) => startResize('left', e)"></div>

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

        <div class="resizer col-resizer" @mousedown="(e) => startResize('right', e)"></div>

        <div class="panel-wrapper" :style="{ width: rightWidth + 'px' }">
          <InspectorPanel 
            :node="selectedNode" 
            :is-playing="isPlaying"
          />
        </div>

      </div>
    </div>

    <div class="resizer row-resizer" @mousedown="(e) => startResize('bottom', e)"></div>

    <div class="bottom-section" :style="{ height: bottomHeight + 'px' }">
      <BottomPanel />
    </div>
    
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

/* 🟢 上半部分 */
.top-section {
  flex: 1;
  min-height: 0; /* 关键：防止 flex item 溢出 */
  display: flex;
  flex-direction: column;
}

.main-layout {
  display: flex; 
  flex: 1; 
  overflow: hidden;
}

/* 🟢 下半部分 */
.bottom-section {
  background: #fff;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* 面板容器 */
.panel-wrapper {
  background: #fff;
  display: flex; 
  flex-direction: column;
  flex-shrink: 0;
}

/* 🟢 通用 Resizer */
.resizer {
  background: transparent;
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  transition: background 0.2s;
}

.resizer:hover { 
  background: #42b883; 
}

/* 🟢 列 Resizer (左右) */
.col-resizer {
  width: 4px; 
  cursor: col-resize;
}
.col-resizer::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 1px; background: #e0e0e0;
}
.col-resizer:hover::after { background: transparent; }

/* 🟢 行 Resizer (上下) */
.row-resizer {
  height: 4px;
  cursor: row-resize;
  width: 100%;
  border-top: 1px solid #e0e0e0;
}

.workspace {
  flex: 1; 
  min-width: 0; 
  background-color: #eaeff2;
  position: relative;
  display: flex;
}

.viewport-window {
  width: 100%; 
  height: 100%;
  position: relative;
}

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