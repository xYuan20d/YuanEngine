<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

interface LogEntry {
  id: number
  type: 'log' | 'warn' | 'error' | 'info'
  message: string
  time: string
}

const logs = ref<LogEntry[]>([])
const containerRef = ref<HTMLElement | null>(null)

// 模拟日志 (为了演示)
const addLog = (type: LogEntry['type'], msg: any[]) => {
  const message = msg.map(m => (typeof m === 'object' ? JSON.stringify(m) : String(m))).join(' ')
  const time = new Date().toLocaleTimeString()
  
  logs.value.push({ id: Date.now() + Math.random(), type, message, time })
  
  // 自动滚动到底部
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  })
}

// 拦截系统 console (可选，为了演示效果)
// 真实项目中建议用专门的 Logger 类，这里简单 hook 一下
const originalLog = console.log
const originalWarn = console.warn
const originalError = console.error

console.log = (...args) => { originalLog(...args); addLog('log', args) }
// console.warn = (...args) => { originalWarn(...args); addLog('warn', args) }
console.error = (...args) => { originalError(...args); addLog('error', args) }

const clearLogs = () => {
  logs.value = []
}
</script>

<template>
  <div class="console-panel">
    <div class="toolbar">
      <div class="actions">
        <button @click="clearLogs">🚫 Clear</button>
        <label><input type="checkbox" checked> Collapse</label>
      </div>
      <div class="search">
        <input placeholder="Filter..." />
      </div>
    </div>
    
    <div class="log-container" ref="containerRef">
      <div 
        v-for="log in logs" 
        :key="log.id" 
        class="log-row"
        :class="log.type"
      >
        <span class="time">[{{ log.time }}]</span>
        <span class="msg">{{ log.message }}</span>
      </div>
      
      <div v-if="logs.length === 0" class="empty">No logs captured</div>
    </div>
  </div>
</template>

<style scoped>
.console-panel { display: flex; flex-direction: column; height: 100%; font-family: 'Consolas', monospace; font-size: 12px; }
.toolbar { 
  height: 28px; background: #f3f3f3; border-bottom: 1px solid #e0e0e0; 
  display: flex; align-items: center; justify-content: space-between; padding: 0 8px;
}
.actions button { cursor: pointer; border: 1px solid #ccc; background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
.actions button:hover { background: #eee; }
.log-container { flex: 1; overflow-y: auto; background: #fff; }
.log-row { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; display: flex; gap: 8px; white-space: pre-wrap; }
.log-row:hover { background: #f9f9f9; }
.log-row.warn { background: #fffbe6; color: #d48806; }
.log-row.error { background: #fff2f0; color: #ff4d4f; }
.time { color: #999; flex-shrink: 0; }
.empty { color: #ccc; text-align: center; margin-top: 20px; font-style: italic; }
</style>