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

let MAX_LOGS = 500 // 🟢 定义最大容量

// 🟢 1. 安全序列化函数 (核心修复)
// 使用 WeakSet 来记录已遍历的对象，遇到循环引用时输出 "[Circular]"
const safeStringify = (obj: any) => {
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, (key, value) => {
      // 只处理非空对象
      if (typeof value === 'object' && value !== null) {
        
        // ⚡ 优化：针对 Three.js 对象 (Object3D) 只输出关键信息
        // 防止几万行的数据把浏览器卡死
        if (value.isObject3D) {
           return `[Object3D: ${value.name || 'Unnamed'} (ID:${value.id}) type:${value.type}]`;
        }
        
        // 检测循环引用
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    }, 2); // 缩进 2 空格
  } catch (e) {
    return String(obj);
  }
}

// 模拟日志
const addLog = (type: LogEntry['type'], msg: any[]) => {
  const message = msg.map(m => (typeof m === 'object' ? safeStringify(m) : String(m))).join(' ')
  const time = new Date().toLocaleTimeString()
  
  // 1. 添加新日志
  logs.value.push({ id: Date.now() + Math.random(), type, message, time })
  
  // 🟢 2. 内存保护：超过限制移除旧日志
  // 保持数组长度在 MAX_LOGS 以内，就像贪吃蛇一样
  if (logs.value.length > MAX_LOGS) {
    // shift() 移除数组第一个元素（最旧的），这比 splice 更快一点
    logs.value.shift()
  }
  
  // 自动滚动到底部
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  })
}

// 拦截系统 console
// const originalLog = console.log
// const originalWarn = console.warn
// const originalError = console.error

// console.log = (...args) => { originalLog(...args); addLog('log', args) }
// console.warn = (...args) => { originalWarn(...args); addLog('warn', args) } // warn 可选开启
// console.error = (...args) => { originalError(...args); addLog('error', args) }

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