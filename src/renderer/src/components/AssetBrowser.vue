<script setup lang="ts">
import { ref, inject, watch, computed, nextTick, onUnmounted } from 'vue'
import { FileSystem, FileEntry } from '../engine/FileSystem'
import { useContextMenu } from '../composables/useContextMenu'
import { SceneManager } from '../engine/SceneManager' // 🟢 1. 引入 SceneManager

// --- 基础状态 ---
const projectRoot = inject('project-root') as any
const currentPath = ref<string>('') 
const files = ref<FileEntry[]>([])
const { showContextMenu } = useContextMenu()

// --- 选中系统 (Selection System) ---
const selectedPaths = ref<Set<string>>(new Set()) // 存储被选中的文件完整路径
const lastSelectedPath = ref<string | null>(null) // 用于 Shift 连选(暂未实现)或定位

// --- 框选系统 (Marquee Selection) ---
const isSelecting = ref(false)
const selectionBox = ref({ x: 0, y: 0, w: 0, h: 0 })
const startPos = { x: 0, y: 0 }
const containerRef = ref<HTMLElement | null>(null)

// --- 重命名系统 ---
const renamingPath = ref<string | null>(null) // 当前正在重命名的文件路径
const renameInput = ref<string>('')
const renameInputRef = ref<HTMLInputElement | null>(null)

// 1. 加载文件
const loadFiles = async () => {
  if (!projectRoot.value) return
  
  const fullPath = currentPath.value 
    ? await FileSystem.pathJoin(projectRoot.value, currentPath.value) 
    : projectRoot.value

  const res = await FileSystem.readDir(fullPath)
  if (res.success && res.data) {
    files.value = res.data.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name)
      return a.isDirectory ? -1 : 1
    })
    // 刷新后清理选中状态，防止选中不存在的文件
    selectedPaths.value.clear()
  }
}

watch([projectRoot, currentPath], loadFiles, { immediate: true })

// 辅助：获取文件的相对路径
const getRelPath = (fileName: string) => currentPath.value ? `${currentPath.value}/${fileName}` : fileName

// --- 选中逻辑 ---
const selectItem = (file: FileEntry, multi: boolean = false) => {
  const path = getRelPath(file.name)
  if (multi) {
    // Ctrl/Cmd + Click: 切换选中
    if (selectedPaths.value.has(path)) {
      selectedPaths.value.delete(path)
    } else {
      selectedPaths.value.add(path)
      lastSelectedPath.value = path
    }
  } else {
    // 单选
    selectedPaths.value.clear()
    selectedPaths.value.add(path)
    lastSelectedPath.value = path
  }
}

const clearSelection = () => {
  selectedPaths.value.clear()
  lastSelectedPath.value = null
}

// --- 框选逻辑 ---
const onMouseDown = (e: MouseEvent) => {
  // 如果点在项目上或滚动条上，不触发框选
  if ((e.target as HTMLElement).closest('.grid-item')) return
  
  isSelecting.value = true
  // 记录相对于容器的坐标（需要减去容器的 offset 和 scroll）
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  
  startPos.x = e.clientX - rect.left + containerRef.value.scrollLeft
  startPos.y = e.clientY - rect.top + containerRef.value.scrollTop
  
  selectionBox.value = { x: startPos.x, y: startPos.y, w: 0, h: 0 }
  
  // 如果没按 Ctrl，先清空选中
  if (!e.ctrlKey && !e.metaKey) {
    clearSelection()
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e: MouseEvent) => {
  if (!isSelecting.value || !containerRef.value) return
  
  const rect = containerRef.value.getBoundingClientRect()
  const currentX = e.clientX - rect.left + containerRef.value.scrollLeft
  const currentY = e.clientY - rect.top + containerRef.value.scrollTop
  
  // 计算矩形 (支持反向拖拽)
  const x = Math.min(startPos.x, currentX)
  const y = Math.min(startPos.y, currentY)
  const w = Math.abs(currentX - startPos.x)
  const h = Math.abs(currentY - startPos.y)
  
  selectionBox.value = { x, y, w, h }
  
  // 实时计算碰撞 (选中物体)
  updateSelectionByBox()
}

const updateSelectionByBox = () => {
  if (!containerRef.value) return
  const items = containerRef.value.querySelectorAll('.grid-item:not(.back-item)')
  
  items.forEach((el) => {
    const itemEl = el as HTMLElement
    // 获取每个 Item 相对于容器的坐标
    const itemLeft = itemEl.offsetLeft
    const itemTop = itemEl.offsetTop
    const itemRight = itemLeft + itemEl.offsetWidth
    const itemBottom = itemTop + itemEl.offsetHeight
    
    // 选框坐标
    const boxLeft = selectionBox.value.x
    const boxTop = selectionBox.value.y
    const boxRight = boxLeft + selectionBox.value.w
    const boxBottom = boxTop + selectionBox.value.h
    
    // 碰撞检测 (AABB)
    const isIntersecting = !(boxRight < itemLeft || boxLeft > itemRight || boxBottom < itemTop || boxTop > itemBottom)
    
    const fileName = itemEl.dataset.filename
    if (!fileName) return
    const path = getRelPath(fileName)
    
    if (isIntersecting) {
      selectedPaths.value.add(path)
    } else {
      // 只有在没按 Ctrl 的情况下才移除（为了简单，这里简化了逻辑，暂不支持框选减选）
      // 实际生产中通常会记录 "框选开始前的选中状态" 来做 diff
      // 这里简单处理：只要不碰就不选
      // selectedPaths.value.delete(path) 
    }
  })
}

const onMouseUp = () => {
  isSelecting.value = false
  selectionBox.value = { x: 0, y: 0, w: 0, h: 0 }
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

// --- 重命名逻辑 ---
const startRename = (file: FileEntry) => {
  renamingPath.value = getRelPath(file.name)
  renameInput.value = file.name
  // 等待 DOM 更新后聚焦 Input
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
    // 执行重命名
    const oldPathFull = await FileSystem.pathJoin(projectRoot.value, currentPath.value, oldName)
    const newPathFull = await FileSystem.pathJoin(projectRoot.value, currentPath.value, newName)
    
    const res = await FileSystem.rename(oldPathFull, newPathFull)
    if (res.success) {
      loadFiles()
    } else {
      alert('Rename failed: ' + res.error)
    }
  }
  
  renamingPath.value = null // 退出重命名模式
}

const cancelRename = () => {
  renamingPath.value = null
}

// --- 拖拽移动 (Internal Drag & Drop) ---
const onDragStart = (e: DragEvent, file: FileEntry) => {
  if (!e.dataTransfer) return
  
  // 如果拖拽的是已选中的，则拖拽所有选中的
  // 如果拖拽的是未选中的，则只拖拽这一个
  const path = getRelPath(file.name)
  if (!selectedPaths.value.has(path)) {
    selectItem(file)
  }
  
  const itemsToDrag = Array.from(selectedPaths.value)
  
  // 核心数据 (给 Scene 用)
  e.dataTransfer.setData('asset/type', file.isDirectory ? 'folder' : 'file')
  e.dataTransfer.setData('asset/name', file.name)
  e.dataTransfer.setData('asset/path', path)
  
  // 内部数据 (给 AssetBrowser 自己用)
  e.dataTransfer.setData('internal/move', JSON.stringify(itemsToDrag))
  e.dataTransfer.effectAllowed = 'copyMove'
}

const onDrop = async (e: DragEvent, targetFolder?: FileEntry) => {
  const moveData = e.dataTransfer?.getData('internal/move')
  if (!moveData) return // 不是内部文件拖拽，可能是外部文件
  
  const srcPaths: string[] = JSON.parse(moveData)
  
  // 确定目标路径
  let targetRelPath = currentPath.value
  if (targetFolder) {
    // 拖进了一个文件夹
    targetRelPath = targetRelPath ? `${targetRelPath}/${targetFolder.name}` : targetFolder.name
  }
  
  // 执行移动
  for (const srcRel of srcPaths) {
    const fileName = srcRel.split('/').pop() || ''
    // 防止自己拖进自己
    if (srcRel === targetRelPath) continue 
    
    const srcFull = await FileSystem.pathJoin(projectRoot.value, srcRel)
    const destFull = await FileSystem.pathJoin(projectRoot.value, targetRelPath, fileName)
    
    await FileSystem.rename(srcFull, destFull) // Move 本质就是 Rename 路径
  }
  
  loadFiles()
}

// --- 交互逻辑 ---
const onDoubleClick = async (file: FileEntry) => {
  if (file.isDirectory) {
    currentPath.value = getRelPath(file.name)
    clearSelection()
  } 
  else if (file.name.endsWith('.macro')) {
    if (!projectRoot.value) return

    const fullPath = await FileSystem.pathJoin(projectRoot.value, currentPath.value, file.name)
    
    // 打开宏，并传入“离开时的闭包”
    await SceneManager.openMacro(file.name, fullPath, async (ctx) => {
      
      // 💾 自动保存逻辑
      // 只有当数据变脏了 (isDirty) 才写盘，避免无效 IO
      if (ctx.isDirty && ctx.filePath) {
        console.log(`[AutoSave] Saving macro: ${ctx.name}`)
        
        // 序列化
        const data = JSON.stringify(ctx.nodes, null, 2)
        
        // 写入
        const res = await FileSystem.writeFile(ctx.filePath, data)
        
        if (res.success) {
           // 可选：给个轻提示 toast
           console.log('✅ Macro saved successfully')
        } else {
           alert('Failed to auto-save macro!')
        }
      }
      
    })
  }
}

const navigateUp = () => {
  if (!currentPath.value) return
  const parts = currentPath.value.split('/')
  parts.pop()
  currentPath.value = parts.join('/')
  clearSelection()
}

// 右键菜单
const onContextMenu = (e: MouseEvent, file?: FileEntry) => {
  // 优化：右键点击未选中的，先选中它
  if (file) {
    const path = getRelPath(file.name)
    if (!selectedPaths.value.has(path)) {
      selectItem(file)
    }
  } else {
    // 点击空白处，如果不是在多选操作，可以考虑取消选中，或者保持
    // 这里选择保持，符合 Windows 习惯
  }

  const menu = []
  
  // 针对选中的文件操作
  if (selectedPaths.value.size > 0) {
    const count = selectedPaths.value.size
    menu.push({ 
      label: count > 1 ? `Delete ${count} Items` : 'Delete', 
      action: () => deleteSelected() 
    })
    
    if (count === 1 && file) {
       menu.push({ label: 'Rename', action: () => startRename(file) })
    }
    menu.push({ separator: true })
  }
  
  menu.push({ label: 'New Folder', action: () => createFolder() })
  menu.push({ label: 'New Script', action: () => createScript() })
  menu.push({ label: 'Refresh', action: loadFiles })

  showContextMenu(e, menu)
}

// --- CRUD ---
const createFolder = async () => {
  // 这里的 Prompt 也可以优化成内联新建，为了简单先保留 Prompt
  const name = prompt('Folder Name:', 'New Folder')
  if (!name) return
  const fullPath = await FileSystem.pathJoin(projectRoot.value, currentPath.value, name)
  await FileSystem.mkdir(fullPath)
  loadFiles()
}

const createScript = async () => {
    const name = prompt('Script Name:', 'NewScript.js')
    if (!name) return
    const template = `export default class ${name.replace('.js', '')} extends Behaviour {
  onStart() { console.log('${name} started'); }
  onUpdate(dt) {}
}`
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

// 面包屑
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
          renaming: renamingPath === getRelPath(file.name)
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
          <svg v-if="file.isDirectory" class="folder-icon" viewBox="0 0 24 24" fill="#fbbf24" stroke="currentColor">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <svg v-else-if="file.name.endsWith('.macro')" class="file-icon macro-icon" viewBox="0 0 24 24" fill="#e1bee7" stroke="#8e44ad">
            <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15 6.04 7.5 12 10.85l5.96-3.35L12 4.15zM5 15.91l6 3.38v-6.71L5 9.21v6.7zm14 0v-6.7l-6 3.37v6.71l6-3.38z"/>
          </svg>
          <svg v-else class="file-icon" viewBox="0 0 24 24" fill="#f3f4f6" stroke="#9ca3af">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
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
          <div v-else class="label" :title="file.name">{{ file.name }}</div>
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
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  grid-auto-rows: 80px;
  gap: 4px;
  align-content: start;
  position: relative; /* 关键：给框选框做定位基准 */
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 6px 4px;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.1s;
  position: relative;
}

.grid-item:hover { background: #f0f5ff; }
.grid-item.selected { background: #cce8ff; border-color: #99d1ff; }
/* 当重命名时，背景变白，边框消失 */
.grid-item.renaming { background: transparent; border-color: transparent; }

.icon-wrapper { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
.icon-wrapper.tiny { font-size: 20px; }
.folder-icon, .file-icon { width: 100%; height: 100%; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.05)); }

.label-area { width: 100%; display: flex; justify-content: center; }
.label {
  font-size: 10px; text-align: center; color: #444; width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2;
  padding: 1px 3px; border-radius: 2px;
}
.selected .label { color: #000; background: rgba(255,255,255,0.2); }

/* 重命名输入框 */
.rename-input {
  width: 90%; font-size: 10px; text-align: center;
  border: 1px solid #409eff; outline: none; padding: 1px;
  background: #fff; color: #333; z-index: 10;
}

/* 框选框样式 */
.selection-box {
  position: absolute;
  background: rgba(0, 120, 215, 0.2);
  border: 1px solid rgba(0, 120, 215, 0.6);
  pointer-events: none; /* 让鼠标事件穿透选框，否则无法 mouseup */
  z-index: 999;
}

.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 12px; font-style: italic; }
</style>