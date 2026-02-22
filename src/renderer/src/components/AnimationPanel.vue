<script setup lang="ts">
import { ref, computed, inject, Ref, onUnmounted } from 'vue'
import { useAnimationEditor } from '../composables/useAnimationEditor'

// --- 注入逻辑核心 ---
const { 
  state: editorState, 
  startEditing, 
  stopEditing, 
  recordKeyframe, 
  saveClip, 
  loadClip, 
  scrub 
} = useAnimationEditor()

const allKeyTimes = computed(() => {
  return Array.from(editorState.keyframes.keys()).sort((a, b) => a - b)
})

// --- 注入上下文 ---
const currentSelectionId = inject<Ref<string | null>>('current-selection-id')
const nodesMap = inject<Ref<Map<string, any>>>('nodes-map')
const projectRoot = inject('project-root') as any

// --- UI 状态 ---
const currentPathInput = ref('') 
const frameRate = 60
const zoom = ref(100)        
const scrollContainerRef = ref<HTMLElement | null>(null)
const sidebarListRef = ref<HTMLElement | null>(null) 
const isScrubbing = ref(false)

// 轨道折叠状态
const expandedPaths = ref(new Set<string>(['position', 'rotation', 'scale'])) 

// 显示当前绑定对象的名称
const targetName = computed(() => {
  if (!editorState.targetNodeId || !nodesMap?.value) return 'None'
  const node = nodesMap.value.get(editorState.targetNodeId)
  return node ? node.name : editorState.targetNodeId
})

// --- 辅助函数 ---
const getValueByPath = (obj: any, path: string) => {
  if (!obj) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    // 处理数组索引 components.0.props
    if (Array.isArray(current) && !isNaN(Number(part))) {
      current = current[Number(part)]
    } else {
      current = current?.[part]
    }
  }
  return current
}

const toggleExpand = (path: string) => {
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path)
  } else {
    expandedPaths.value.add(path)
  }
}

// --- 🟢 核心：生成轨道数据 (包含结构补全 + 变化检测) ---
const tracks = computed(() => {
  if (!editorState.originalState) return []

  // 1. 构建“超级虚拟节点” (包含所有帧出现过的属性)
  // 先深拷贝原始状态作为基底
  const virtualNode = JSON.parse(JSON.stringify(editorState.originalState))
  
  // 遍历所有关键帧，补充 virtualNode 里缺失的结构
  for (const snapshot of editorState.keyframes.values()) {
    // A. 检查 Visible
    if (snapshot.visible !== undefined && virtualNode.visible === undefined) {
      virtualNode.visible = snapshot.visible 
    }

    // B. 检查 Components
    if (snapshot.components && Array.isArray(snapshot.components)) {
      if (!virtualNode.components) virtualNode.components = []

      snapshot.components.forEach((snapComp: any, index: number) => {
        // 情况 1: 发现新组件
        if (!virtualNode.components[index]) {
          virtualNode.components[index] = JSON.parse(JSON.stringify(snapComp))
        } 
        // 情况 2: 组件已存在，但检查有没有新 Props
        else {
           const vComp = virtualNode.components[index]
           if (snapComp.props) {
             for (const key in snapComp.props) {
               if (!(key in vComp.props)) {
                 vComp.props[key] = snapComp.props[key]
               }
             }
           }
        }
      })
    }
  }

  // 2. 准备时间点
  const keyTimes = allKeyTimes.value
  const resultTracks: any[] = []

  // 3. 创建轨道生成器
  const createPropTrack = (label: string, initialVal: any, path: string) => {
    
    // 内部函数：计算关键帧状态 (Active/Passive)
    const calculateActiveKeys = (subPath: string) => {
      return keyTimes.map((time, index) => {
        const currentSnapshot = editorState.keyframes.get(time)
        const currentVal = getValueByPath(currentSnapshot, subPath)
        
        let hasChanged = false
        if (index === 0) {
           // 第0帧：只要值存在就显示
           hasChanged = currentVal !== undefined
        } else {
          const prevTime = keyTimes[index - 1]
          const prevSnapshot = editorState.keyframes.get(prevTime)
          const prevVal = getValueByPath(prevSnapshot, subPath)
          
          if (currentVal !== prevVal) hasChanged = true
          // 数字精度容错
          if (typeof currentVal === 'number' && typeof prevVal === 'number') {
            hasChanged = Math.abs(currentVal - prevVal) > 0.0001
          }
        }
        return { 
          time, 
          active: hasChanged, // 用于 UI 区分显示
          value: currentVal 
        }
      })
    }

    // A. Vector3 [x,y,z]
    if (Array.isArray(initialVal) && initialVal.length === 3 && typeof initialVal[0] === 'number') {
      return {
        label: label,
        path: path,
        expanded: expandedPaths.value.has(path),
        children: ['X', 'Y', 'Z'].map((axis, i) => ({
          label: `${label}.${axis}`,
          path: `${path}.${i}`,
          keys: calculateActiveKeys(`${path}.${i}`)
        }))
      }
    }

    // B. 单数值 / 字符串(HexColor) / 布尔值
    if (typeof initialVal === 'number' || typeof initialVal === 'string' || typeof initialVal === 'boolean') {
      return {
        label: label,
        path: path,
        keys: calculateActiveKeys(path)
      }
    }
    return null
  }

  // 4. 基于 virtualNode 生成轨道
  // Visible
  if (virtualNode.visible !== undefined) {
    resultTracks.push(createPropTrack('Visibility', virtualNode.visible, 'visible'))
  } else {
    // 默认补一个，防止某帧突然用了 visible 却没轨道
    resultTracks.push(createPropTrack('Visible', true, 'visible'))
  }

  // Transform
  if (virtualNode.position) resultTracks.push(createPropTrack('Position', virtualNode.position, 'position'))
  if (virtualNode.rotation) resultTracks.push(createPropTrack('Rotation', virtualNode.rotation, 'rotation'))
  if (virtualNode.scale)    resultTracks.push(createPropTrack('Scale',    virtualNode.scale,    'scale'))

  // Components
  if (virtualNode.components && Array.isArray(virtualNode.components)) {
    virtualNode.components.forEach((comp: any, index: number) => {
      if (!comp) return 

      const childTracks: any[] = []
      if (comp.props) {
        for (const propKey in comp.props) {
          const propVal = comp.props[propKey]
          const track = createPropTrack(propKey, propVal, `components.${index}.props.${propKey}`)
          if (track) childTracks.push(track)
        }
      }
      
      if (childTracks.length > 0) {
        const compPath = `components.${index}`
        resultTracks.push({
          label: `${comp.type}`,
          path: compPath,
          expanded: expandedPaths.value.has(compPath),
          children: childTracks
        })
      }
    })
  }

  return resultTracks
})

// --- 计算属性对接 ---
const currentFrame = computed({
  get: () => Math.floor(editorState.currentTime * frameRate),
  set: (val) => {
    const t = val / frameRate
    editorState.currentTime = t
    scrub(t)
  }
})

const totalDuration = computed(() => {
  const times = Array.from(editorState.keyframes.keys())
  const maxTime = times.length > 0 ? Math.max(...times) : 0
  return Math.max(editorState.duration, maxTime + 1.0)
})

const playheadOffset = computed(() => editorState.currentTime * zoom.value)
const worldWidth = computed(() => totalDuration.value * zoom.value)

// --- 交互逻辑 ---

const handleStartLink = () => {
  // 取消链接
  if (editorState.isEditing && editorState.targetNodeId === currentSelectionId?.value) {
    stopEditing()
    return
  }

  // 建立链接
  if (currentSelectionId?.value) {
    startEditing(
      currentSelectionId.value, 
      currentPathInput.value || null, 
      projectRoot.value
    )
    if (currentPathInput.value) {
      editorState.currentFilePath = currentPathInput.value
    }
  } else {
    alert('请先在场景或层级面板中选中一个物体！')
  }
}

const togglePlay = () => {
  // TODO: 对接真实的 requestAnimationFrame 循环
  editorState.isEditing = !editorState.isEditing
}

const toggleRecord = () => {
  editorState.isRecording = !editorState.isRecording
}

const handleSave = async () => {
  if (!currentPathInput.value) {
    alert('请输入保存路径 (例如 assets/anim/run.anim)')
    return
  }
  editorState.currentFilePath = currentPathInput.value
  await saveClip(projectRoot.value)
}

const handleLoad = async () => {
  if (!currentPathInput.value) {
    alert('请输入加载路径')
    return
  }
  
  if (!editorState.targetNodeId) {
    if (currentSelectionId?.value) {
      startEditing(currentSelectionId.value, currentPathInput.value, projectRoot.value)
    } else {
      alert('请先 Link 一个物体，或者先选中物体再点击 Load')
      return
    }
  } else {
    editorState.currentFilePath = currentPathInput.value
    await loadClip(projectRoot.value, currentPathInput.value)
  }
}

// --- 鼠标操作 ---
const handleMouseDown = (e: MouseEvent) => {
  isScrubbing.value = true
  updateTimeByMouse(e)
  document.addEventListener('mousemove', updateTimeByMouse)
  document.addEventListener('mouseup', handleMouseUp)
}

const updateTimeByMouse = (e: MouseEvent) => {
  if (!scrollContainerRef.value) return
  const rect = scrollContainerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollContainerRef.value.scrollLeft
  const newTime = Math.max(0, Math.min(x / zoom.value, totalDuration.value))
  
  scrub(newTime)
}

const handleMouseUp = () => {
  isScrubbing.value = false
  document.removeEventListener('mousemove', updateTimeByMouse)
  document.removeEventListener('mouseup', handleMouseUp)
}

const onTimelineScroll = (e: Event) => {
  if (!sidebarListRef.value || !scrollContainerRef.value) return
  sidebarListRef.value.scrollTop = scrollContainerRef.value.scrollTop
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`
}

const addKey = () => recordKeyframe(editorState.currentTime)

onUnmounted(() => {
  stopEditing()
})
</script>

<template>
  <div class="animation-panel">
    
    <div class="toolbar">
      <div class="file-group">
        <input 
          v-model="currentPathInput" 
          placeholder="assets/anim/new.anim" 
          class="path-input"
          title="Animation File Path"
        />
        <button class="ctrl-btn" @click="handleLoad" title="Load Animation">📂</button>
        <button class="ctrl-btn" @click="handleSave" title="Save Animation">💾</button>
        
        <div class="separator"></div>
        
        <button 
          class="target-btn" 
          :class="{ 
            active: !!editorState.targetNodeId, 
            ready: !editorState.targetNodeId && !!currentSelectionId 
          }"
          @click="handleStartLink"
          :title="editorState.targetNodeId ? 'Click to Unlink' : 'Link Selected Object'"
        >
          <span class="icon">🔗</span>
          <span class="text">
            {{ editorState.targetNodeId ? targetName : (currentSelectionId ? 'Link Selected' : 'No Selection') }}
          </span>
        </button>
      </div>

      <div class="separator"></div>

      <div class="controls-group">
        <button 
          class="record-btn" 
          :class="{ active: editorState.isRecording }"
          @click="toggleRecord"
          title="Auto Keying (Record)"
        >●</button>
        <div class="separator"></div>
        <button class="ctrl-btn" @click="editorState.currentTime = 0">|&lt;</button> 
        <button class="ctrl-btn" @click="currentFrame--">&lt;</button>
        <button class="ctrl-btn play-btn" @click="togglePlay">{{ '▶' }}</button>
        <button class="ctrl-btn" @click="currentFrame++">&gt;</button>
      </div>

      <div class="time-display">
        <input type="number" v-model="currentFrame" class="frame-input" />
        <span class="time-label">{{ formatTime(editorState.currentTime) }}</span>
      </div>
      
      <div class="spacer"></div>
      
      <div class="zoom-controls">
        <button class="ctrl-btn" @click="zoom = Math.max(10, zoom - 10)">-</button>
        <span style="font-size:10px; color:#999;">Zoom</span>
        <button class="ctrl-btn" @click="zoom += 10">+</button>
      </div>

      <button class="ctrl-btn" @click="addKey">◆ Add Key</button>
    </div>

    <div class="editor-body">
      <div class="sidebar">
        <div class="sidebar-header">Summary</div>
        <div class="track-list-container">
            <div class="track-list" ref="sidebarListRef">
              <template v-for="(group, gIdx) in tracks" :key="gIdx">
                <div class="track-item group-item">
                  <span 
                    class="arrow" 
                    @click="toggleExpand(group.path)"
                  >
                    {{ group.expanded ? '▼' : '▶' }}
                  </span>
                  <span class="track-name">{{ group.label }}</span>
                </div>
                <template v-if="group.expanded">
                  <div v-for="(track, tIdx) in group.children" :key="tIdx" class="track-item property-item">
                    <span class="track-name">{{ track.label }}</span>
                  </div>
                </template>
              </template>
              <div style="height: 20px;"></div>
           </div>
        </div>
      </div>

      <div class="timeline-scroll-container" ref="scrollContainerRef" @scroll="onTimelineScroll">
        <div class="timeline-content" :style="{ width: worldWidth + 'px' }">
          
          <div class="ruler-wrapper" @mousedown="handleMouseDown">
            <div 
              v-for="s in Math.ceil(totalDuration)" 
              :key="s" 
              class="ruler-mark-major"
              :style="{ left: (s-1) * zoom + 'px' }"
            >
              {{ s-1 }}s
            </div>

            <div 
              v-for="t in allKeyTimes" 
              :key="t" 
              class="global-key-marker"
              :style="{ left: (t * zoom) + 'px' }"
              title="Global Keyframe"
            ></div>
          </div>

          <div class="playhead-wrapper" :style="{ left: playheadOffset + 'px' }">
            <div class="playhead-handle">▼</div>
            <div class="playhead-line"></div>
          </div>

          <div class="tracks-area">
             <template v-for="(group, gIdx) in tracks" :key="gIdx">
                <div class="track-row group-row"></div>
                <template v-if="group.expanded">
                  <div v-for="(track, tIdx) in group.children" :key="tIdx" class="track-row property-row">
                    <div 
                      v-for="(kInfo, kIdx) in track.keys" 
                      :key="kIdx"
                      class="keyframe"
                      :class="{ 'inactive': !kInfo.active }" 
                      :style="{ left: (kInfo.time * zoom) + 'px' }"
                      :title="`Time: ${kInfo.time}s\nValue: ${kInfo.value}`"
                    ></div>
                  </div>
                </template>
             </template>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animation-panel {
  display: flex; flex-direction: column; height: 100%;
  background: #fff; font-family: 'Segoe UI', sans-serif; user-select: none;
}

/* Toolbar */
.toolbar {
  height: 28px; background: #f3f3f3; border-bottom: 1px solid #e0e0e0;
  display: flex; align-items: center; padding: 0 8px; gap: 8px; flex-shrink: 0;
}
.controls-group { display: flex; align-items: center; gap: 2px; }
.record-btn {
  width: 18px; height: 18px; border-radius: 50%; border: 1px solid #ccc;
  background: #eee; color: #d00; display: flex; align-items: center; justify-content: center;
  font-size: 10px; cursor: pointer; transition: all 0.2s;
}
.record-btn.active { background: #d00; color: #fff; border-color: #a00; box-shadow: 0 0 4px rgba(221, 0, 0, 0.4); }
.ctrl-btn {
  background: none; border: 1px solid transparent; cursor: pointer; color: #555;
  font-size: 10px; padding: 2px 6px; border-radius: 3px;
}
.ctrl-btn:hover { background: #e0e0e0; color: #333; }
.play-btn { min-width: 24px; }
.separator { width: 1px; height: 14px; background: #ccc; margin: 0 4px; }
.time-display {
  display: flex; align-items: center; gap: 4px; background: #fff;
  border: 1px solid #dcdfe6; border-radius: 3px; padding: 0 4px; height: 20px;
}
.frame-input { width: 40px; border: none; outline: none; text-align: right; font-size: 11px; color: #409eff; font-weight: bold; }
.time-label { font-size: 10px; color: #999; border-left: 1px solid #eee; padding-left: 4px; }
.spacer { flex: 1; }
.zoom-controls { display: flex; align-items: center; margin-right: 10px; }

/* Editor Body */
.editor-body { flex: 1; display: flex; overflow: hidden; }

/* Sidebar */
.sidebar {
  width: 200px; border-right: 1px solid #e0e0e0; display: flex; flex-direction: column;
  background: #f9f9f9; flex-shrink: 0; z-index: 20; 
}
.sidebar-header {
  height: 24px; line-height: 24px; padding-left: 8px; font-size: 10px;
  color: #666; background: #f1f1f1; border-bottom: 1px solid #e0e0e0;
}
.track-list-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
/* 占位符，保持和右侧标尺一样高 */
.sidebar-ruler-placeholder { height: 24px; border-bottom: 1px solid #e0e0e0; background: #fcfcfc; flex-shrink: 0; }

/* 🟢 修改：移除 overflow-y: hidden，改由 JS 控制，这里设为 auto 或 hidden 都可以，但 hidden 更像 IDE 风格 */
.track-list { 
  flex: 1; 
  overflow-y: hidden; /* 隐藏滚动条，完全由右侧控制 */
  overflow-x: hidden; 
} 

.track-item {
  height: 24px; display: flex; align-items: center; padding-left: 8px;
  border-bottom: 1px solid #f0f0f0; font-size: 11px; color: #555; box-sizing: border-box;
}
.group-item { background: #f5f5f5; font-weight: 600; color: #333; }
.property-item { padding-left: 24px; background: #fff; }
.arrow { width: 16px; cursor: pointer; font-size: 9px; color: #888; }

/* Timeline Scroll Container */
/* 右侧是“主”，它有 overflow: auto，它出滚动条 */
.timeline-scroll-container {
  flex: 1; overflow: auto; position: relative; background: #fff;
}

/* Timeline World Content */
.timeline-content {
  position: relative;
  /* background-size 由行内样式控制，这里不再定义 */
  background-image: linear-gradient(to right, #f5f5f5 1px, transparent 1px);
}

/* Ruler */
.ruler-wrapper {
  height: 24px; background: #fcfcfc; border-bottom: 1px solid #e0e0e0;
  position: sticky; top: 0; left: 0; z-index: 10; cursor: pointer;
}
.ruler-mark-major {
  position: absolute; top: 0; bottom: 0; font-size: 9px; color: #999;
  padding-left: 4px; border-left: 1px solid #ccc; pointer-events: none;
}

/* Playhead */
.playhead-wrapper {
  position: absolute; top: 0; bottom: 0; width: 1px; z-index: 15;
  pointer-events: none;
}
.playhead-handle {
  position: sticky; top: 0; 
  transform: translateX(-50%); width: 10px; text-align: center;
  color: #409eff; font-size: 10px; margin-top: 2px;
  z-index: 20;
}
.playhead-line {
  position: absolute; top: 24px; bottom: 0; width: 1px; background: #409eff;
}

/* Tracks */
.tracks-area { position: relative; }
.track-row { height: 24px; border-bottom: 1px solid #f5f5f5; position: relative; box-sizing: border-box; }
.group-row { background: rgba(0,0,0,0.02); }
.property-row:hover { background-color: rgba(64, 158, 255, 0.05); }

.path-input {
  width: 140px;
  border: 1px solid #ccc;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 3px;
  color: #333;
}
.file-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}
.target-badge {
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 3px;
  background: #eee;
  color: #999;
}
.target-badge.active {
  background: #e1f3d8;
  color: #67c23a;
  border: 1px solid #c2e7b0;
}

.keyframe {
  position: absolute; top: 7px; width: 10px; height: 10px;
  background: #cfd8dc; border: 1px solid #78909c;
  transform: translateX(-5px) rotate(45deg); cursor: pointer; z-index: 2;
}
.keyframe.inactive {
  display: none;
}
.keyframe:hover { background: #fff; border-color: #409eff; }

.target-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid #ccc;
  background: #f0f0f0;
  border-radius: 12px; /* 圆角胶囊状 */
  cursor: pointer;
  font-size: 10px;
  color: #666;
  transition: all 0.2s;
  max-width: 120px;
}

/* 激活状态 (已链接) */
.target-btn.active {
  background: #e1f3d8;
  border-color: #c2e7b0;
  color: #67c23a;
}

/* 就绪状态 (未链接，但有东西可连) */
.target-btn.ready:hover {
  background: #fff;
  border-color: #409eff;
  color: #409eff;
}

.target-btn .text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-key-marker {
  position: absolute;
  bottom: 0;        /* 沉在标尺底部 */
  height: 12px;     /* 占标尺高度的一半，显得精致 */
  width: 1px;       /* 细条 */
  background-color: #67c23a; /* 鲜艳的绿色 */
  pointer-events: none; /* 让鼠标点击穿透，不影响拖拽播放头 */
  z-index: 5; /* 在刻度文字之上，在播放头之下(播放头是15) */
}
</style>