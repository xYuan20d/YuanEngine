<script setup lang="ts">
import { ref } from 'vue'

interface LogEntry {
  id: number
  type: 'log' | 'warn' | 'error' | 'info'
  message: string
  time: string
}

const logs = ref<LogEntry[]>([])

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