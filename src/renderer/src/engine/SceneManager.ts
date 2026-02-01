// src/engine/SceneManager.ts
import { ref, computed, watch } from 'vue'
import { IGameNode } from '../types/schema'
import { FileSystem } from './FileSystem'
import { Cloner } from './Cloner' // 🟢 引入 Cloner

// --- 1. 定义上下文接口 ---
export interface IEditorContext {
  id: string           
  type: 'root' | 'macro'
  name: string         
  filePath: string | null 
  
  nodes: IGameNode[]
  
  isDirty: boolean
  
  // 离开时的回调
  onLeave?: (ctx: IEditorContext) => Promise<void> | void
}

const contextStack = ref<IEditorContext[]>([]) 

const activeContext = computed(() => {
  if (contextStack.value.length === 0) return null
  return contextStack.value[contextStack.value.length - 1]
})

// 自动脏检查
watch(() => activeContext.value?.nodes, (newVal) => {
  if (activeContext.value) {
    activeContext.value.isDirty = true
  }
}, { deep: true })


// --- 🟢 核心算法：递归热替换 ---
// 遍历场景树，找到所有 source 等于 macroPath 的节点，用 newMacroData 替换它
const _hotReplaceMacroInNodes = (nodes: IGameNode[], macroPath: string, newMacroData: IGameNode) => {
  if (!nodes) return

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    // 1. 检查当前节点是否是目标宏的实例
    // 注意：这里做简单的字符串包含匹配，实际生产建议规范化路径 (normalize path)
    if (node.macro && node.macro.source && macroPath.includes(node.macro.source)) {
      console.log(`[HotUpdate] Replacing instance: ${node.name} (${node.id})`)

      // --- 💥 硬替换逻辑 ---
      
      // A. 备份关键数据 (忽略列表：Transform + ID + Parent关系)
      const preservedState = {
        id: node.id,
        position: [...node.position],
        rotation: [...node.rotation],
        scale: [...node.scale],
        active: node.active 
      }

      // B. 克隆新数据 (使用定向克隆，强制保持 ID 一致!)
      const newInstance = Cloner.instantiate(newMacroData, preservedState.id)

      // C. 还原状态
      newInstance.position = preservedState.position
      newInstance.rotation = preservedState.rotation
      newInstance.scale = preservedState.scale
      newInstance.active = preservedState.active
      
      // D. 补回 macro 标记
      newInstance.macro = { source: node.macro.source }

      // E. 替换 (In-place replacement)
      nodes[i] = newInstance
      
      // 替换后，子节点已全是新的，不需要再递归 search children
    } else {
      // 2. 如果不是目标宏，继续递归搜索子节点
      if (node.children && node.children.length > 0) {
        _hotReplaceMacroInNodes(node.children, macroPath, newMacroData)
      }
    }
  }
}


// --- 核心操作方法 ---

const initRoot = (nodes: IGameNode[], path: string | null) => {
  const safeNodes = Array.isArray(nodes) ? nodes : [nodes]
  contextStack.value = [{
    id: 'ctx_root',
    type: 'root',
    name: 'Main Scene',
    filePath: path,
    nodes: safeNodes,
    isDirty: false
  }]
}

// 🟢 修改 openMacro：内置自动保存和合并逻辑
const openMacro = async (name: string, path: string) => {
  const res = await FileSystem.readFile(path)
  if (!res.success || !res.data) {
    console.error('Failed to open macro:', res.error)
    return
  }

  try {
    const rawData = JSON.parse(res.data)
    // 兼容对象和数组
    const nodes = Array.isArray(rawData) ? rawData : [rawData]
    
    contextStack.value.push({
      id: `ctx_${Date.now()}`,
      type: 'macro',
      name: name,
      filePath: path,
      nodes: nodes, 
      isDirty: false,
      
      // 🟢 注册回调：离开时自动保存并触发热更新
      onLeave: async (ctx) => {
        // 只有脏了才处理
        if (ctx.isDirty && ctx.filePath) {
          console.log(`[AutoSave] Saving macro: ${ctx.name}`)
          
          // 1. 保存文件到磁盘
          const dataStr = JSON.stringify(ctx.nodes, null, 2)
          const writeRes = await FileSystem.writeFile(ctx.filePath, dataStr)
          
          if (writeRes.success) {
             console.log('✅ Macro written to disk.')
             
             // 2. 🔥 触发热更新 (Hot Update)
             // 宏的根节点通常是 ctx.nodes[0]
             const newMacroRoot = ctx.nodes[0] 
             if (!newMacroRoot) return

             // 遍历栈里 *其他* 所有上下文 (主要是 Main Scene)
             for (const otherCtx of contextStack.value) {
               if (otherCtx === ctx) continue // 跳过自己
               
               console.log(`[HotUpdate] Scanning context: ${otherCtx.name}`)
               
               // 执行递归替换
               // 注意：这里直接传 ctx.filePath (绝对路径) 和 node.macro.source (相对路径)
               // _hotReplaceMacroInNodes 内部做了简单的 includes 匹配
               _hotReplaceMacroInNodes(otherCtx.nodes, ctx.filePath, newMacroRoot)
             }
          } else {
             alert('Failed to save macro!')
          }
        }
      }
    })
    
    console.log(`[SceneManager] Opened macro: ${name}`)
  } catch (e) {
    console.error('Invalid macro JSON', e)
  }
}

const closeActiveContext = async () => {
  if (contextStack.value.length <= 1) return 
  const ctx = activeContext.value
  if (ctx && ctx.onLeave) await ctx.onLeave(ctx)
  contextStack.value.pop()
}

const jumpToContext = async (index: number) => {
  if (index < 0 || index >= contextStack.value.length) return
  const contextsToRemove = contextStack.value.slice(index + 1).reverse()
  for (const ctx of contextsToRemove) {
    if (ctx.onLeave) await ctx.onLeave(ctx)
  }
  contextStack.value.splice(index + 1)
}

const currentNodes = computed({
  get: () => activeContext.value?.nodes || [],
  set: (val) => { if (activeContext.value) activeContext.value.nodes = val }
})

export const SceneManager = {
  stack: contextStack,
  activeContext,
  currentNodes,
  initRoot,
  openMacro,
  closeActiveContext,
  jumpToContext
}