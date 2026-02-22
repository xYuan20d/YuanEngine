// src/composables/useAnimationEditor.ts
import { reactive } from 'vue'
import { IGameNode } from '../types/schema'
import { DiffUtil } from '../utils/DiffPatch' // 假设你已经有了这个
import { FileSystem } from '../engine/FileSystem'
import { SceneManager } from '../engine/SceneManager'

// ------------------------------------------------------------------
// 类型定义
// ------------------------------------------------------------------

export interface AnimationKeyframe {
  time: number
  // 在内存中，我们存全量快照；在文件中，这里存的是 Diff
  data: any 
}

export interface AnimationClip {
  name: string
  duration: number
  loop: boolean
  // 基础帧 (第0秒的状态)
  baseState: any
  // 关键帧链 (按时间排序)
  frames: AnimationKeyframe[] 
}

// ------------------------------------------------------------------
// 辅助：深度插值 (Deep Lerp)
// ------------------------------------------------------------------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// 递归插值两个状态对象
const deepLerp = (start: any, end: any, t: number): any => {
  // 1. 如果类型不同或一方为空，直接阶梯过渡 (Step)
  if (typeof start !== typeof end || start === null || end === null) {
    return t < 1.0 ? start : end
  }

  // 2. 数字 -> 线性插值
  if (typeof start === 'number') {
    return lerp(start, end, t)
  }

  // 3. 数组 (如 Position [x,y,z], Color [r,g,b]) -> 逐个插值
  if (Array.isArray(start)) {
    // 长度不同无法插值，直接返回
    if (start.length !== end.length) return t < 1.0 ? start : end
    return start.map((val, i) => deepLerp(val, end[i], t))
  }

  // 4. 对象 -> 递归插值
  if (typeof start === 'object') {
    const result: any = {}
    //以此为准：只处理 start 中有的 key（或者双方都有的）
    // 为了简单，我们取 start 的 key
    for (const key in start) {
      if (key in end) {
        result[key] = deepLerp(start[key], end[key], t)
      } else {
        result[key] = start[key] // 对方没有，保持原样
      }
    }
    return result
  }

  // 5. 其他类型 (String, Boolean) -> 阶梯过渡
  return t < 1.0 ? start : end
}

// ------------------------------------------------------------------
// Composable
// ------------------------------------------------------------------

// 全局单例状态 (编辑器内唯一)
const state = reactive({
  isEditing: false,
  isRecording: false,
  
  targetNodeId: null as string | null,
  currentFilePath: null as string | null,
  
  currentTime: 0,
  duration: 3.0,
  
  // 运行时缓存：时间 -> 全量状态
  // 使用 Map 方便按时间存取，但渲染轨道时需要转为 Array
  keyframes: new Map<number, any>(),
  
  // 原始状态备份 (用于退出编辑时还原)
  originalState: null as any
})

export function useAnimationEditor() {

  // --- 1. 核心操作：进入/退出编辑模式 ---

  const startEditing = async (nodeId: string, filePath: string | null = null, projectRoot: string | null = null) => {
    // 找到节点对象
    const node = findNode(nodeId)
    if (!node) return

    state.isEditing = true
    state.targetNodeId = nodeId
    state.currentFilePath = filePath
    state.currentTime = 0
    state.keyframes.clear()

    // 备份原始状态
    state.originalState = JSON.parse(JSON.stringify(node))

    // 如果有文件路径且有项目根目录，尝试加载
    if (filePath && projectRoot) {
      await loadClip(projectRoot, filePath)
    } else {
      // 新建动画：自动把当前状态作为第 0 帧
      const cleanState = extractAnimatableState(node)
      state.keyframes.set(0, cleanState)
    }
  }

  const stopEditing = () => {
    if (!state.isEditing || !state.targetNodeId) return

    // 还原物体状态
    const node = findNode(state.targetNodeId)
    if (node && state.originalState) {
      applyStateToNode(node, state.originalState)
    }

    // 重置状态
    state.isEditing = false
    state.isRecording = false
    state.targetNodeId = null
    state.currentFilePath = null
    state.keyframes.clear()
    state.originalState = null
  }

  // --- 2. 核心操作：录制关键帧 ---

  /**
   * 捕获当前节点状态并存为关键帧
   * @param time 时间点 (秒)
   */
  const recordKeyframe = (time: number = state.currentTime) => {
    const node = findNode(state.targetNodeId)
    if (!node) return

    // 1. 获取当前状态快照
    // 注意：我们要剔除一些不需要动画的字段 (如 id, children, macro)
    // 这里我们只保留 transform 和 components
    const snapshot = extractAnimatableState(node)

    // 2. 存入 Map
    // 如果该时间点已有帧，直接覆盖
    state.keyframes.set(time, snapshot)
    
    console.log(`[Anim] ⏺ Recorded frame at ${time.toFixed(2)}s`)
  }

  /**
   * 自动录制 (当 Inspector 修改属性时调用)
   * 只有在开启 isRecording 且处于编辑模式时才生效
   */
  const autoRecord = () => {
    if (state.isEditing && state.isRecording) {
      recordKeyframe(state.currentTime)
    }
  }

  // --- 3. 核心操作：预览 (Scrubbing) ---

  /**
   * 计算指定时间点的状态，并应用到物体上
   */
  const scrub = (time: number) => {
    state.currentTime = time
    const node = findNode(state.targetNodeId)
    if (!node || state.keyframes.size === 0) return

    // 1. 找到前一帧 (Prev) 和 后一帧 (Next)
    // 先将所有时间点排序
    const times = Array.from(state.keyframes.keys()).sort((a, b) => a - b)
    
    let prevTime = times[0]
    let nextTime = times[times.length - 1]

    // 边界情况：时间小于第一帧 或 大于最后一帧
    if (time <= prevTime) {
      applyStateToNode(node, state.keyframes.get(prevTime))
      return
    }
    if (time >= nextTime) {
      applyStateToNode(node, state.keyframes.get(nextTime))
      return
    }

    // 寻找区间
    for (let i = 0; i < times.length - 1; i++) {
      if (time >= times[i] && time < times[i + 1]) {
        prevTime = times[i]
        nextTime = times[i + 1]
        break
      }
    }

    // 2. 计算插值进度 t
    const duration = nextTime - prevTime
    const t = (time - prevTime) / duration

    // 3. 执行插值
    const startState = state.keyframes.get(prevTime)
    const endState = state.keyframes.get(nextTime)
    
    // 使用 deepLerp 计算中间状态
    const interpolatedState = deepLerp(startState, endState, t)

    // 4. 应用到节点
    applyStateToNode(node, interpolatedState)
  }

  // --- 4. 文件 IO：Diff 链的生成与还原 ---

  const saveClip = async (projectRoot: string) => {
    if (!state.currentFilePath) {
      alert("Please enter a file path first (e.g. assets/anim/jump.anim)")
      return
    }
    if (!projectRoot) {
      console.error("[Anim] No project root provided")
      return
    }

    // 1. 准备数据 (保持不变)
    const times = Array.from(state.keyframes.keys()).sort((a, b) => a - b)
    if (times.length === 0) return

    const baseTime = times[0]
    const baseState = state.keyframes.get(baseTime)
    const frameData: any[] = [] // 使用 any 避免类型报错
    let previousState = baseState

    for (let i = 0; i < times.length; i++) {
      const t = times[i]
      const currentState = state.keyframes.get(t)
      if (i !== 0) {
        const diff = DiffUtil.diff(previousState, currentState)
        if (diff) frameData.push({ time: t, data: diff })
      }
      previousState = currentState
    }

    const clipData = { // 不用 AnimationClip 接口，直接构建对象，更灵活
      name: state.currentFilePath.split('/').pop() || 'Anim',
      duration: state.duration,
      loop: true,
      baseState: baseState,
      frames: frameData
    }

    // 🟢 2. 路径处理核心修复
    try {
      // 拼接绝对路径：ProjectRoot + RelativePath
      const fullPath = await FileSystem.pathJoin(projectRoot, state.currentFilePath)
      
      const json = JSON.stringify(clipData, null, 2)
      const res = await FileSystem.writeFile(fullPath, json)
      
      if (res.success) {
        console.log(`[Anim] Saved to ${fullPath}`)
        alert(`Animation saved to ${state.currentFilePath}`)
      } else {
        console.error("Save failed", res.error)
        alert(`Save failed: ${res.error}`)
      }
    } catch (e) {
      console.error("[Anim] Save exception:", e)
    }
  }

  const loadClip = async (projectRoot: string, relativePath: string) => {
    if (!projectRoot || !relativePath) return

    try {
      // 拼接绝对路径
      const fullPath = await FileSystem.pathJoin(projectRoot, relativePath)
      const res = await FileSystem.readFile(fullPath)
      
      if (!res.success || !res.data) {
        console.warn(`[Anim] Failed to read file: ${fullPath}`)
        return
      }

      const clip = JSON.parse(res.data)
      state.duration = clip.duration || 3.0
      state.keyframes.clear()
      
      // 还原逻辑 (保持不变)
      let currentState = clip.baseState
      state.keyframes.set(0, currentState)

      if (clip.frames) {
        for (const kf of clip.frames) {
          const nextState = DiffUtil.patch(currentState, kf.data)
          state.keyframes.set(kf.time, nextState)
          currentState = nextState
        }
      }
      console.log(`[Anim] Loaded ${state.keyframes.size} frames from ${relativePath}`)
      
      // 更新状态里的路径，保持一致
      state.currentFilePath = relativePath

    } catch (e) {
      console.error("Failed to parse anim file", e)
      alert("Failed to load animation file")
    }
  }

  // --- 内部辅助 ---

  // 这里的查找逻辑需要依赖外部注入的 Map，或者直接用 SceneManager
  // 为了解耦，我们在 ViewportEditor 里 provide 了 `nodes-map`，但这里是 Composable
  // 最简单的方式是直接用 SceneManager.currentNodes 递归查找
  const findNode = (id: string | null): IGameNode | null => {
    if (!id) return null
    const findRecursive = (nodes: IGameNode[]): IGameNode | null => {
      for (const n of nodes) {
        if (n.id === id) return n
        if (n.children) {
          const res = findRecursive(n.children)
          if (res) return res
        }
      }
      return null
    }
    return findRecursive(SceneManager.currentNodes.value)
  }

  const extractAnimatableState = (node: IGameNode) => {
    // 深拷贝，只取我们需要的数据
    return JSON.parse(JSON.stringify({
      position: node.position,
      rotation: node.rotation,
      scale: node.scale,
      visible: node.visible,
      // 组件的 props 也是重点
      components: node.components.map(c => ({
        type: c.type,
        props: c.props,
        active: c.active
      }))
    }))
  }

  const applyStateToNode = (node: IGameNode, snapshot: any) => {
    if (!snapshot) return
    
    // 🟢 核心修复：Transform 必须切断引用！使用 [...array] 创建新数组
    // 之前是 node.position = snapshot.position，导致 Gizmo 修改直接污染了关键帧缓存
    if (snapshot.position) node.position = [...snapshot.position] as [number, number, number]
    if (snapshot.rotation) node.rotation = [...snapshot.rotation] as [number, number, number]
    if (snapshot.scale) node.scale = [...snapshot.scale] as [number, number, number]
    
    if (snapshot.visible !== undefined) node.visible = snapshot.visible

    // 2. Components (保持之前的逻辑，这里已经是深拷贝了)
    if (snapshot.components && Array.isArray(snapshot.components)) {
      
      const snapComps = snapshot.components;
      const nodeComps = node.components;

      // A. 删除多余的组件
      if (nodeComps.length > snapComps.length) {
        nodeComps.splice(snapComps.length);
      }

      // B. 同步/新增组件
      snapComps.forEach((snapComp: any, index: number) => {
        const existing = nodeComps[index];

        if (!existing || existing.type !== snapComp.type) {
          if (existing) {
             nodeComps[index] = JSON.parse(JSON.stringify(snapComp));
          } else {
             nodeComps.push(JSON.parse(JSON.stringify(snapComp)));
          }
        } else {
          // 这里也是安全的，因为 JSON.parse/stringify 创建了新对象
          existing.props = JSON.parse(JSON.stringify(snapComp.props));
          existing.active = snapComp.active;
        }
      })
    }
  }

  return {
    state,
    startEditing,
    stopEditing,
    recordKeyframe,
    autoRecord,
    scrub,
    saveClip,
    loadClip
  }
}