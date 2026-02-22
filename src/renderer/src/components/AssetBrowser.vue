<script setup lang="ts">
import { ref, inject, watch, computed, nextTick } from 'vue'
import { FileSystem, FileEntry } from '../engine/FileSystem'
import { useContextMenu } from '../composables/useContextMenu'
import { SceneManager } from '../engine/SceneManager'

// --- 基础状态 ---
const projectRoot = inject('project-root') as any
const currentPath = ref<string>('') 
const files = ref<FileEntry[]>([])
const { showContextMenu } = useContextMenu()

// --- 选中系统 ---
const selectedPaths = ref<Set<string>>(new Set()) 
const lastSelectedPath = ref<string | null>(null)

// --- 框选系统 ---
const isSelecting = ref(false)
const selectionBox = ref({ x: 0, y: 0, w: 0, h: 0 })
const startPos = { x: 0, y: 0 }
const containerRef = ref<HTMLElement | null>(null)

// --- 重命名系统 ---
const renamingPath = ref<string | null>(null)
const renameInput = ref<string>('')
const renameInputRef = ref<HTMLInputElement | null>(null)

// --- 图标系统 (新增) ---
// 定义不同类型的 SVG 路径
// --- 图标系统 (工业/极简风格) ---
const ICON_PATHS = {
  // 文件夹：经典的扁平文件夹，实心但颜色低调
  folder: "M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z",
  
  // Project.json：一个齿轮，代表引擎核心配置 (不加文件边框，直接展示核心元素)
  project: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z",
  
  // 3D Model：线框立方体 (更具技术感)
  model: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M7.5 4.21l4.5 2.6 4.5-2.6m-9 15.58V9.42l4.5 2.6v7.71m9-7.71v-7.71l-4.5 2.6v7.71",
  
  // Script：文件轮廓 + 尖括号 (代表逻辑)
  script: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M9.5 14l-2.5-2.5 2.5-2.5 M14.5 14l2.5-2.5-2.5-2.5",
  
  // UI (.vue)：方框内的布局分割 (类似网页/HUD)
  ui: "M3 3h18v18H3V3zm0 5h18M9 8v13",
  
  // File (Generic)：极简折角纸张
  file: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M14 2v6h6",
  
  // Image：极简山峰
  image: "M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z",
  
  // Data (JSON)：大括号
  data: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M10 10a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1 M14 10a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1 1 1 0 0 0-1 1v1a1 1 0 0 1-1 1",
  
  // Macro：节点连接图
  macro: "M5 7h4v4H5V7zm10 6h4v4h-4v-4zm-4-3h4" // 简化的连线示意
}

// 获取文件图标配置
const resolveFileIcon = (file: FileEntry) => {
  // 文件夹：由于是最常见的，使用稍微深一点的灰金色，或者完全的深灰色
  if (file.isDirectory) {
    // 工业风文件夹通常是实心的，颜色较深
    return { path: ICON_PATHS.folder, color: '#8caebf', fill: '#8caebf', strokeWidth: 0 } // 蓝灰色实心
    // 或者纯灰: color: '#71717a', fill: '#71717a'
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || ''

  // 1. Project.json (核心)
  if (file.name === 'project.json' && currentPath.value === '') {
    // 红色太警示了，用深红色或紫色表示"核心"
    return { path: ICON_PATHS.project, color: '#be185d', fill: 'transparent', strokeWidth: 1.5 } 
  }

  // 2. 3D Models (Mesh)
  if (['glb', 'gltf', 'fbx', 'obj'].includes(ext)) {
    // 橙色/土色，代表几何体，但饱和度低
    return { path: ICON_PATHS.model, color: '#d97706', fill: 'none', strokeWidth: 1.2 } 
  }

  // 3. Scripts (Logic)
  if (['js', 'ts'].includes(ext)) {
    // 稍微带点黄色的灰
    return { path: ICON_PATHS.script, color: '#eab308', fill: 'none', strokeWidth: 1.2 }
  }

  // 4. UI (Vue)
  if (ext === 'vue') {
    // 青色/蓝绿色，代表界面
    return { path: ICON_PATHS.ui, color: '#0d9488', fill: 'none', strokeWidth: 1.2 } 
  }

  // 5. Macro (Blueprints)
  if (ext === 'macro') {
    // 紫色线条
    return { path: ICON_PATHS.macro, color: '#9333ea', fill: 'none', strokeWidth: 1.2 }
  }

  // 6. Data
  if (['json', 'yaml', 'xml'].includes(ext)) {
    return { path: ICON_PATHS.data, color: '#57534e', fill: 'none', strokeWidth: 1.2 } // Stone gray
  }

  // 7. Images
  if (['png', 'jpg', 'jpeg', 'svg', 'bmp'].includes(ext)) {
    return { path: ICON_PATHS.image, color: '#7c3aed', fill: 'none', strokeWidth: 1.2 }
  }

  // Default File
  return { path: ICON_PATHS.file, color: '#94a3b8', fill: 'none', strokeWidth: 1.2 }
}

// --- 业务逻辑 (保持原样) ---

const loadFiles = async () => {
  if (!projectRoot.value) return
  
  const fullPath = currentPath.value 
    ? await FileSystem.pathJoin(projectRoot.value, currentPath.value) 
    : projectRoot.value

  const res = await FileSystem.readDir(fullPath)
  if (res.success && res.data) {
    files.value = res.data.sort((a, b) => {
      // 排序优化：文件夹 > project.json > 其他文件
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      if (currentPath.value === '') {
        if (a.name === 'project.json') return -1
        if (b.name === 'project.json') return 1
      }
      return a.name.localeCompare(b.name)
    })
    selectedPaths.value.clear()
  }
}

watch([projectRoot, currentPath], loadFiles, { immediate: true })

const getRelPath = (fileName: string) => currentPath.value ? `${currentPath.value}/${fileName}` : fileName

const selectItem = (file: FileEntry, multi: boolean = false) => {
  const path = getRelPath(file.name)
  if (multi) {
    if (selectedPaths.value.has(path)) {
      selectedPaths.value.delete(path)
    } else {
      selectedPaths.value.add(path)
      lastSelectedPath.value = path
    }
  } else {
    selectedPaths.value.clear()
    selectedPaths.value.add(path)
    lastSelectedPath.value = path
  }
}

const clearSelection = () => {
  selectedPaths.value.clear()
  lastSelectedPath.value = null
}

const onMouseDown = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.grid-item')) return
  isSelecting.value = true
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  startPos.x = e.clientX - rect.left + containerRef.value.scrollLeft
  startPos.y = e.clientY - rect.top + containerRef.value.scrollTop
  selectionBox.value = { x: startPos.x, y: startPos.y, w: 0, h: 0 }
  if (!e.ctrlKey && !e.metaKey) clearSelection()
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e: MouseEvent) => {
  if (!isSelecting.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const currentX = e.clientX - rect.left + containerRef.value.scrollLeft
  const currentY = e.clientY - rect.top + containerRef.value.scrollTop
  const x = Math.min(startPos.x, currentX)
  const y = Math.min(startPos.y, currentY)
  const w = Math.abs(currentX - startPos.x)
  const h = Math.abs(currentY - startPos.y)
  selectionBox.value = { x, y, w, h }
  updateSelectionByBox()
}

const updateSelectionByBox = () => {
  if (!containerRef.value) return
  const items = containerRef.value.querySelectorAll('.grid-item:not(.back-item)')
  items.forEach((el) => {
    const itemEl = el as HTMLElement
    const itemLeft = itemEl.offsetLeft
    const itemTop = itemEl.offsetTop
    const itemRight = itemLeft + itemEl.offsetWidth
    const itemBottom = itemTop + itemEl.offsetHeight
    const boxLeft = selectionBox.value.x
    const boxTop = selectionBox.value.y
    const boxRight = boxLeft + selectionBox.value.w
    const boxBottom = boxTop + selectionBox.value.h
    const isIntersecting = !(boxRight < itemLeft || boxLeft > itemRight || boxBottom < itemTop || boxTop > itemBottom)
    
    const fileName = itemEl.dataset.filename
    if (!fileName) return
    const path = getRelPath(fileName)
    if (isIntersecting) selectedPaths.value.add(path)
  })
}

const onMouseUp = () => {
  isSelecting.value = false
  selectionBox.value = { x: 0, y: 0, w: 0, h: 0 }
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

const startRename = (file: FileEntry) => {
  renamingPath.value = getRelPath(file.name)
  renameInput.value = file.name
  nextTick(() => {
    if (renameInputRef.value) {
      renameInputRef.value.focus()
      renameInputRef.value.select()
    }
  })
}

const confirmRename = async () => {
  if (!renamingPath.value) return
  const oldName = renamingPath.value.split('/').pop() || ''
  const newName = renameInput.value.trim()
  if (newName && newName !== oldName) {
    const oldPathFull = await FileSystem.pathJoin(projectRoot.value, currentPath.value, oldName)
    const newPathFull = await FileSystem.pathJoin(projectRoot.value, currentPath.value, newName)
    const res = await FileSystem.rename(oldPathFull, newPathFull)
    if (res.success) loadFiles()
    else alert('Rename failed: ' + res.error)
  }
  renamingPath.value = null
}

const cancelRename = () => {
  renamingPath.value = null
}

const onDragStart = (e: DragEvent, file: FileEntry) => {
  if (!e.dataTransfer) return
  const path = getRelPath(file.name)
  if (!selectedPaths.value.has(path)) selectItem(file)
  const itemsToDrag = Array.from(selectedPaths.value)
  e.dataTransfer.setData('asset/type', file.isDirectory ? 'folder' : 'file')
  e.dataTransfer.setData('asset/name', file.name)
  e.dataTransfer.setData('asset/path', path)
  e.dataTransfer.setData('internal/move', JSON.stringify(itemsToDrag))
  e.dataTransfer.effectAllowed = 'copyMove'
}

const onDrop = async (e: DragEvent, targetFolder?: FileEntry) => {
  const moveData = e.dataTransfer?.getData('internal/move')
  if (!moveData) return 
  const srcPaths: string[] = JSON.parse(moveData)
  let targetRelPath = currentPath.value
  if (targetFolder) targetRelPath = targetRelPath ? `${targetRelPath}/${targetFolder.name}` : targetFolder.name
  for (const srcRel of srcPaths) {
    const fileName = srcRel.split('/').pop() || ''
    if (srcRel === targetRelPath) continue 
    const srcFull = await FileSystem.pathJoin(projectRoot.value, srcRel)
    const destFull = await FileSystem.pathJoin(projectRoot.value, targetRelPath, fileName)
    await FileSystem.rename(srcFull, destFull)
  }
  loadFiles()
}

const onDoubleClick = async (file: FileEntry) => {
  if (file.isDirectory) {
    currentPath.value = getRelPath(file.name)
    clearSelection()
  } 
  else if (file.name.endsWith('.macro')) {
    if (!projectRoot.value) return
    const fullPath = await FileSystem.pathJoin(projectRoot.value, currentPath.value, file.name)
    await SceneManager.openMacro(file.name, fullPath)
  }
}

const navigateUp = () => {
  if (!currentPath.value) return
  const parts = currentPath.value.split('/')
  parts.pop()
  currentPath.value = parts.join('/')
  clearSelection()
}

const onContextMenu = (e: MouseEvent, file?: FileEntry) => {
  if (file) {
    const path = getRelPath(file.name)
    if (!selectedPaths.value.has(path)) selectItem(file)
  }
  const menu: any = []
  if (selectedPaths.value.size > 0) {
    const count = selectedPaths.value.size
    menu.push({ label: count > 1 ? `Delete ${count} Items` : 'Delete', action: () => deleteSelected() })
    if (count === 1 && file) menu.push({ label: 'Rename', action: () => startRename(file) })
    menu.push({ separator: true })
  }
  menu.push({ label: 'New Folder', action: () => createFolder() })
  menu.push({ label: 'New Script', action: () => createScript() })
  menu.push({ label: 'Refresh', action: loadFiles })
  showContextMenu(e, menu)
}

const createFolder = async () => {
  const name = prompt('Folder Name:', 'New Folder')
  if (!name) return
  const fullPath = await FileSystem.pathJoin(projectRoot.value, currentPath.value, name)
  await FileSystem.mkdir(fullPath)
  loadFiles()
}

const createScript = async () => {
    const name = prompt('Script Name:', 'NewScript.js')
    if (!name) return
    const template = `export default class ${name.replace('.js', '')} extends Behaviour {\n  onStart() { console.log('${name} started'); }\n  onUpdate(dt) {}\n}`
    const fullPath = await FileSystem.pathJoin(projectRoot.value, currentPath.value, name)
    await FileSystem.writeFile(fullPath, template)
    loadFiles()
}

const deleteSelected = async () => {
  if (!confirm(`Delete ${selectedPaths.value.size} items?`)) return
  for (const relPath of selectedPaths.value) {
    const fullPath = await FileSystem.pathJoin(projectRoot.value, relPath)
    await FileSystem.delete(fullPath)
  }
  loadFiles()
  clearSelection()
}

const breadcrumbs = computed(() => {
  const parts = currentPath.value ? currentPath.value.split('/') : []
  return ['Assets', ...parts]
})
const navigateToBreadcrumb = (index: number) => {
  if (index === 0) currentPath.value = ''
  else {
    const parts = currentPath.value.split('/')
    currentPath.value = parts.slice(0, index).join('/')
  }
  clearSelection()
}
</script>

<template>
  <div class="asset-browser" @contextmenu.prevent="(e) => onContextMenu(e)">
    <div class="toolbar">
      <div class="breadcrumbs">
        <span 
          v-for="(part, index) in breadcrumbs" 
          :key="index"
          class="crumb"
          :class="{ active: index === breadcrumbs.length - 1 }"
          @click="navigateToBreadcrumb(index)"
        >
          {{ part }}
        </span>
      </div>
      <button class="icon-btn" @click="loadFiles" title="Refresh">↻</button>
    </div>

    <div 
      class="grid-container" 
      v-if="projectRoot" 
      ref="containerRef"
      @mousedown="onMouseDown"
      @dragover.prevent 
      @drop="(e) => onDrop(e)" 
    >
      <div 
        v-if="currentPath" 
        class="grid-item back-item"
        @dblclick="navigateUp"
      >
        <div class="icon-wrapper tiny">⤴️</div>
        <div class="label">..</div>
      </div>

      <div 
        v-for="file in files" 
        :key="file.name"
        class="grid-item"
        :class="{ 
          folder: file.isDirectory, 
          selected: selectedPaths.has(getRelPath(file.name)),
          renaming: renamingPath === getRelPath(file.name),
          'is-project': file.name === 'project.json' && currentPath === ''
        }"
        :data-filename="file.name"
        draggable="true"
        @click.stop="selectItem(file, $event.ctrlKey || $event.metaKey)"
        @dragstart="(e) => onDragStart(e, file)"
        @drop.stop="(e) => file.isDirectory && onDrop(e, file)" 
        @dragover.prevent
        @dblclick="onDoubleClick(file)"
        @contextmenu.stop.prevent="(e) => onContextMenu(e, file)"
      >
        <div class="icon-wrapper">
          <svg 
            class="file-icon" 
            viewBox="0 0 24 24" 
            :fill="resolveFileIcon(file).fill" 
            :stroke="resolveFileIcon(file).color"
            :stroke-width="resolveFileIcon(file).strokeWidth || 2"
            stroke-linecap="round" 
            stroke-linejoin="round"
          >
            <path :d="resolveFileIcon(file).path" />
          </svg>
        </div>
        
        <div class="label-area">
          <input 
            v-if="renamingPath === getRelPath(file.name)"
            ref="renameInputRef"
            v-model="renameInput"
            class="rename-input"
            @blur="confirmRename"
            @keydown.enter="confirmRename"
            @keydown.esc="cancelRename"
            @click.stop
          />
          <div v-else class="label" :title="file.name">
            <span v-if="file.name === 'project.json' && currentPath === ''" style="font-weight:bold; color: #b91c1c;">
              PROJECT
            </span>
            <span v-else>{{ file.name }}</span>
          </div>
        </div>
      </div>

      <div 
        v-if="isSelecting" 
        class="selection-box"
        :style="{
          left: selectionBox.x + 'px',
          top: selectionBox.y + 'px',
          width: selectionBox.w + 'px',
          height: selectionBox.h + 'px'
        }"
      ></div>
    </div>

    <div v-else class="empty-state">
      Open a project to see assets
    </div>
  </div>
</template>

<style scoped>
.asset-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  font-family: 'Segoe UI', sans-serif;
  user-select: none;
}

.toolbar {
  height: 28px;
  background: #f3f3f3; 
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  flex-shrink: 0;
}

.breadcrumbs { flex: 1; display: flex; align-items: center; font-size: 11px; color: #666; overflow: hidden; }
.crumb { cursor: pointer; padding: 0 4px; border-radius: 2px; }
.crumb:hover { background: #e0e0e0; color: #333; }
.crumb:not(:last-child)::after { content: '/'; margin-left: 4px; color: #bbb; }
.crumb.active { font-weight: 600; color: #333; cursor: default; }
.icon-btn { background: none; border: none; cursor: pointer; color: #666; font-size: 12px; padding: 2px 6px; border-radius: 3px; }
.icon-btn:hover { background: #e0e0e0; color: #333; }

.grid-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  /* 调整列宽：最小 72px，适应长文件名 */
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  grid-auto-rows: 88px;
  gap: 4px;
  align-content: start;
  position: relative;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 6px 4px;
  border: 1px solid transparent;
  border-radius: 4px; /* 稍微硬一点的圆角 */
  cursor: pointer;
  transition: background 0.1s;
  position: relative;
  overflow: hidden; /* 防止内容撑破容器 */
}

.grid-item:hover { background: #f0f5ff; }
.grid-item.selected { 
  background: #e2e8f0; /* Slate-200 */
  border-color: #94a3b8; 
}
.grid-item.renaming { background: transparent; border-color: transparent; }

/* Project文件特殊样式 */
.grid-item.is-project { 
  background: transparent; 
  border: 1px dashed #be5380; /* 虚线框表示特殊 */
}
.grid-item.is-project .label {
  color: #be185d;
  font-weight: 600;
}
.grid-item.is-project:hover { background: #fee2e2; }

.icon-wrapper { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; padding: 4px; }
.icon-wrapper.tiny { font-size: 20px; }

/* 统一图标样式 */
.file-icon {
  width: 100%;
  height: 100%;
  /* 移除投影，追求扁平化 */
  filter: none; 
  /* 降低一点透明度，不那么刺眼 */
  opacity: 0.85; 
}

.grid-item:hover .file-icon {
  transform: none; /* 工业软件通常不搞缩放动画，或者非常快 */
  opacity: 1;
}

.label-area { width: 100%; display: flex; justify-content: center; }
.label {
  font-size: 11px;
  color: #475569; /* Slate-600 */
  text-align: center;
  width: 100%;
  
  /* 方案A：单行截断 (最整洁) */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  
  /* 方案B：如果你想要两行显示 (取消注释下面几行，注释掉 white-space: nowrap) */
  /* display: -webkit-box; */
  /* -webkit-line-clamp: 2; */
  /* -webkit-box-orient: vertical; */
  /* overflow: hidden; */
  /* word-break: break-all; */
  
  line-height: 1.2;
  padding: 0 2px;
}
.selected .label { color: #000; background: rgba(255,255,255,0.2); }

.rename-input {
  width: 96%; font-size: 11px; text-align: center;
  border: 1px solid #409eff; outline: none; padding: 2px;
  background: #fff; color: #333; z-index: 10;
}

.selection-box {
  position: absolute;
  background: rgba(0, 120, 215, 0.2);
  border: 1px solid rgba(0, 120, 215, 0.6);
  pointer-events: none;
  z-index: 999;
}

.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 12px; font-style: italic; }
</style>