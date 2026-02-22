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
import SceneBreadcrumbs from './components/SceneBreadcrumbs.vue'
import { SceneManager } from './engine/SceneManager'
import { AssetManager } from './engine/AssetManager'
import { ProjectConfig } from './engine/Engine'


const addModelNode = async (relativePath: string, parentId: string | null) => {
  if (!projectRoot.value) return

  // 1. 加载模型
  const rootObject = await AssetManager.loadModel(projectRoot.value, relativePath)
  if (!rootObject) {
    alert('Failed to load model')
    return
  }

  // 2. 🔍 智能检测特征
  let hasSkinning = false
  rootObject.traverse((c) => {
    if ((c as THREE.SkinnedMesh).isSkinnedMesh) hasSkinning = true
  })
  
  const hasAnimations = rootObject.userData.__animations && rootObject.userData.__animations.length > 0

  // 3. ⚖️ 决策逻辑：如果是“疑似”角色模型，询问用户
  let useBlackBoxMode = false

  if (hasSkinning || hasAnimations) {
    // 弹窗询问用户意图
    const msg = hasSkinning 
      ? `检测到骨骼蒙皮 (SkinnedMesh)。\n是否将其作为一个[整体角色]导入？\n\n- 确定 (OK): 整体导入，支持动画，但无法选中子部件。\n- 取消 (Cancel): 拆解导入，可编辑内部，但骨骼动画将失效。`
      : `检测到动画数据。\n是否将其作为一个[整体]导入以保留动画？\n\n- 确定 (OK): 整体导入，保留动画。\n- 取消 (Cancel): 拆解导入，丢弃动画，可编辑子节点。`
    
    useBlackBoxMode = confirm(msg)
  }

  // =========================================================
  // 分支 A: 黑盒模式 (SkinnedMesh / 整体)
  // =========================================================
  if (useBlackBoxMode) {
    console.log('[Engine] Importing as Single Object (Black Box).')
    
    const node: IGameNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: relativePath.split('/').pop()?.replace(/\.glb$/i, '') || 'Character',
      active: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1], 
      components: [
        {
          // 如果有骨骼，用 SkinnedMesh；如果只是普通动画（如旋转的风扇），也可以用这个组件驱动
          type: 'SkinnedMesh', 
          props: {
            src: { type: 'string', value: relativePath },
            speed: { type: 'number', value: 1.0 },
            defaultAnimation: { type: 'string', value: '' }
          }
        }
      ],
      children: [] // 不生成子节点
    }

    // 插入场景
    addToScene(node, parentId)
    return
  }

  // =========================================================
  // 分支 B: 递归拆解模式 (普通静态模型)
  // =========================================================
  console.log('[Engine] Importing as Recursive Hierarchy.')

  const parseNodeFull = (obj: THREE.Object3D): IGameNode => {
    // A. 基础属性
    const node: IGameNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: obj.name || 'Node',
      active: true,
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      components: [],
      children: []
    }

    // B. 根据类型添加组件
    if ((obj as THREE.Mesh).isMesh) {
      node.components.push({
        type: 'ModelRenderer',
        props: {
          src: { type: 'string', value: relativePath },
          targetNodeName: { type: 'string', value: obj.name }, // 指定渲染 GLB 里的哪一个零件
          recursive: { type: 'boolean', value: false },        // 只渲染这一个，不递归
          castShadow: { type: 'boolean', value: true },
          receiveShadow: { type: 'boolean', value: true }
        }
      })
    } else if ((obj as THREE.Light).isLight) {
        // 如果 GLB 里自带灯光，也可以在这里解析 (暂略)
    }

    // C. 递归子节点
    if (obj.children && obj.children.length > 0) {
      node.children = obj.children.map(child => parseNodeFull(child))
    }

    return node
  }

  // 执行转换
  const rootGameNode = parseNodeFull(rootObject)
  
  // 修正根节点名字
  const fileName = relativePath.split('/').pop() || 'Model'
  rootGameNode.name = fileName.replace(/\.glb$/i, '')

  // 插入场景
  addToScene(rootGameNode, parentId)
}

// 辅助函数：统一插入逻辑
const addToScene = (node: IGameNode, parentId: string | null) => {
  if (parentId) {
    const parent = findNodeRecursive(sceneNodes.value, parentId)
    if (parent) {
      if (!parent.children) parent.children = []
      parent.children.push(node)
    }
  } else {
    sceneNodes.value.push(node)
  }
}


// --- 🟢 新增：创建宏 (Save as Macro) ---
const createMacroFromNode = async (nodeId: string) => {
  const node = findNodeRecursive(sceneNodes.value, nodeId)
  if (!node) return
  if (!projectRoot.value) {
    alert('Please save the project first!')
    return
  }

  const fileName = `${node.name}.macro`
  const relativePath = `assets/${fileName}` 
  
  const macroData = JSON.parse(JSON.stringify(node))
  delete macroData.macro 
  
  const assetsDir = await FileSystem.pathJoin(projectRoot.value, 'assets')
  const exists = await FileSystem.exists(assetsDir)
  if (!exists) {
     await FileSystem.createDir(assetsDir)
  }

  const fullPath = await FileSystem.pathJoin(assetsDir, fileName)
  
  // 🟢 关键修改：用 [ ] 包裹 macroData
  // 这样宏文件就变成了标准的 Scene Nodes 格式
  const fileContent = JSON.stringify([macroData], null, 2)
  
  const res = await FileSystem.writeFile(fullPath, fileContent)
  
  if (res.success) {
    console.log(`[Engine] Macro created: ${relativePath}`)
    node.macro = { source: relativePath }
    alert(`Macro saved to ${relativePath}`)
  } else {
    console.error('Failed to create macro:', res.error)
    alert('Failed to save macro.')
  }
}

const instantiateMacro = async (relativePath: string, parentId: string | null) => {
  if (!projectRoot.value) return

  const fullPath = await FileSystem.pathJoin(projectRoot.value, relativePath)
  const res = await FileSystem.readFile(fullPath)
  
  if (!res.success || !res.data) {
    console.error('Failed to read macro:', res.error)
    return
  }

  try {
    const rawData = JSON.parse(res.data)
    
    // 🟢 关键修改：标准化为数组
    // 无论文件里是 {...} 还是 [{...}]，都变成 [{...}]
    const nodesToInstantiate = Array.isArray(rawData) ? rawData : [rawData]
    
    // 遍历实例化每一个根节点 (通常宏里只有一个，但这样写更健壮)
    for (const rawNode of nodesToInstantiate) {
      
      const instance = Cloner.instantiate(rawNode)
      
      // 注入宏标记
      instance.macro = {
        source: relativePath
      }
      
      // 放入场景
      if (parentId) {
        const parent = findNodeRecursive(sceneNodes.value, parentId)
        if (parent) {
          if (!parent.children) parent.children = []
          parent.children.push(instance)
        }
      } else {
        sceneNodes.value.push(instance)
      }
      
      console.log(`[Engine] Instantiated macro node: ${instance.name}`)
      
      nextTick(() => {
        currentSelection.value = instance.id
      })
    }

  } catch (e) {
    console.error('Failed to instantiate macro:', e)
  }
}

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
  if (FileSystem.getEnv() === "Web") alert("This web version is for demonstration purposes only. To create your own games, please download the full app.\n\n此网页版仅供演示之用。如需创建您自己的游戏，请下载完整版应用程序。")

  // 如果没有 SceneManager 初始化, 界面会是空的, 留null
  SceneManager.initRoot(demo, null)

  // 🟢 2. 监听保存请求 (支持多场景上下文)
  FileSystem.onRequestSave(async () => {
    // 获取当前激活的编辑器上下文, 可能是 Root, 也可能是 Macro
    const ctx = SceneManager.activeContext.value
    if (!ctx) return

    // 序列化当前上下文的节点树
    const data = JSON.stringify(ctx.nodes, null, 2)

    // CASE A: 如果当前是在编辑“宏”
    if (ctx.type === 'macro') {
      if (ctx.filePath) {
        const res = await FileSystem.writeFile(ctx.filePath, data)
        if (res.success) {
          console.log(`✅ Macro saved: ${ctx.name}`)
          ctx.isDirty = false // 清除脏标记
        } else {
          console.error('Macro save failed:', res.error)
        }
      } else {
        console.error('Macro context missing file path!')
      }
      return
    }

    // CASE B: 如果当前是在编辑“根场景” (Project)
    // 逻辑和以前类似，但要判断是“覆盖保存”还是“另存为”
    
    // B1. 覆盖保存
    if (projectRoot.value) {
      const res = await FileSystem.saveProject(projectRoot.value, data)
      if (res.success) {
        console.log('✅ Project saved!')
        ctx.isDirty = false
      } else {
        console.error('Save failed:', res.error)
      }
    } 
    // B2. 另存为 (新建项目)
    else {
      const res = await FileSystem.saveProjectAs(data)
      
      if (res.success && res.data && res.data.path) {
        // 更新全局状态
        projectRoot.value = res.data.path
        ProjectConfig.rootPath = res.data.path
        
        // 更新 SceneManager 根上下文的路径
        ctx.filePath = res.data.path
        ctx.isDirty = false

        document.title = `YuanEngine - ${res.data.path}`
        alert(`项目已创建于：${res.data.path}\n请将你的 JS 脚本放入该目录下的 scripts 文件夹中。`)
      } else if (res.error) {
        console.error('Save As failed:', res.error)
      }
    }
  })

  // 🟢 3. 监听打开项目
  FileSystem.onProjectOpened(async (path: string) => {
    console.log('📂 Opening project:', path)
    
    try {
      ProjectConfig.rootPath = path
      const projectFile = await FileSystem.pathJoin(path, 'project.json')
      const res = await FileSystem.readFile(projectFile)
      
      if (res.success && res.data) {
        // 反序列化
        const nodes = JSON.parse(res.data)
        
        // 🟢 使用 SceneManager 重置整个堆栈，加载新项目
        SceneManager.initRoot(nodes, path)
        
        // 同步 App 内部状态
        projectRoot.value = path
        currentSelection.value = null
        document.title = `YuanEngine - ${path}`
        
      } else {
        if (confirm('该文件夹没有 project.json，是否初始化为新项目？')) {
          // 初始化为空项目
          SceneManager.initRoot([], path)
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
const addNode = (type: 'Mesh' | 'Light' | 'Camera' | 'Empty' | 'UIWidget', subtype: string, parentId?: string) => {
  const id = 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5)
  
  // 1. 基础结构
  const newNode: IGameNode = {
    id,
    name: subtype === 'Empty' ? 'New Empty' : `New ${subtype}`,
    active: true,
    visible: true,
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
  else if (type === 'UIWidget') {
    newNode.components.push({
      type: 'UIWidget',
      props: { uiPath: '' } // 默认空的
    })
  }
  else if (type === 'Light') {
    // 🟢 修改：根据 subtype 设置具体的灯光类型
    const lightType = subtype === 'Directional' ? 'Directional' : 'Point'
    
    newNode.name = `${lightType} Light`
    
    newNode.components.push({
      type: 'Light',
      props: { 
        lightType: lightType, // 👈 写入类型
        intensity: 1, 
        color: '#ffffff',
        distance: 0,
        castShadow: true
      }
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

const demo: IGameNode[] = [
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
]

// --- 数据部分 ---
const sceneNodes = SceneManager.currentNodes

const currentSelection = ref<string | null>(null)
const currentTool = ref<'translate' | 'rotate' | 'scale'>('translate')
const isPlaying = ref(false)
const showToolbar = ref(true)

// 切换运行状态
const togglePlay = () => {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    currentSelection.value = null
    // 🟢 通知 SceneManager 切入运行环境 (生成快照)
    SceneManager.enterPlayMode()
  } else {
    // 🟢 通知 SceneManager 切回编辑环境 (销毁快照)
    SceneManager.exitPlayMode()
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

provide('current-selection-id', currentSelection)
// 提供编辑器动作给子组件
provide('editor-actions', { addNode, deleteNode, moveNode, copyNode, pasteNode, createMacroFromNode, instantiateMacro, addModelNode })
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
            
            <SceneBreadcrumbs 
              :tools-visible="showToolbar"
              @toggle-tools="showToolbar = !showToolbar"
            />

            <div class="viewport-content" style="position: relative; height: calc(100% - 30px);">
               
               <Transition name="toolbar-slide">
                 <div class="floating-toolbar" v-show="showToolbar">
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
               </Transition>

               <GameViewport 
                 :key="SceneManager.activeContext.value?.id || 'empty'"
                 :scene-data="sceneNodes"
                 :selected-id="currentSelection"
                 :is-playing="isPlaying"
                 :tool-mode="currentTool"
                 @select="(id) => currentSelection = id"
                 @update:transform="handleUpdate"
               />
            </div>
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
  z-index: 99999;
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

<style>
/* 全局样式文件，如 style.css 或 App.vue */
html, body {
  width: 100%;
  height: 100%;
  margin: 0;       /* 去除默认边距 */
  padding: 0;
  overflow: hidden; /* 关键：禁用 body 的滚动条 */
}
</style>