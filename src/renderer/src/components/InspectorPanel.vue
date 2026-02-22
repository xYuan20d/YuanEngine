<script setup lang="ts">
import { reactive, watch, inject } from 'vue'
import { IGameNode } from '../types/schema'
import InspectorAddComponent from './InspectorAddComponent.vue'
import NodePicker from './properties/NodePicker.vue'
import { NativeSchemas } from '../engine/NativeSchemas'
import { FileSystem } from '../engine/FileSystem'
import { useContextMenu } from '../composables/useContextMenu' // 🟢 1. 引入

const props = defineProps<{
  node: IGameNode | null | undefined
}>()

// 缓存脚本的 Schema: { 'path/to/script.js': { speed: ... } }
const scriptSchemas = reactive<Record<string, any>>({}) 
const projectRoot = inject('project-root') as any

const { showContextMenu } = useContextMenu()

const openTransformMenu = (e: MouseEvent) => {
  if (!props.node) return
  
  showContextMenu(e, [
    {
      label: 'Reset Transform',
      icon: '↺',
      action: () => {
        if (!props.node) return
        props.node.position = [0, 0, 0]
        props.node.rotation = [0, 0, 0]
        props.node.scale = [1, 1, 1]
      }
    },
    {
      label: 'Copy World Position',
      icon: '📋',
      action: () => {
        // 这里可以扩展复制逻辑
        console.log('Copy pos:', props.node?.position)
      }
    }
  ])
}

// 🟢 4. 普通组件菜单 (支持删除、移动)
const openComponentMenu = (e: MouseEvent, index: number) => {
  if (!props.node) return

  const comps = props.node.components
  const comp = comps[index]

  showContextMenu(e, [
    {
      label: `Remove ${comp.type}`,
      icon: '🗑️',
      action: () => {
        // 简单确认一下防止手滑
        if (confirm(`Delete component "${comp.type}"?`)) {
          comps.splice(index, 1) // ✂️ 核心删除逻辑
        }
      }
    },
    { separator: true },
    {
      label: 'Move Up',
      icon: '⬆️',
      disabled: index === 0, // 第一个不能上移
      action: () => {
        if (index > 0) {
          const item = comps[index]
          comps.splice(index, 1)
          comps.splice(index - 1, 0, item)
        }
      }
    },
    {
      label: 'Move Down',
      icon: '⬇️',
      disabled: index === comps.length - 1, // 最后一个不能下移
      action: () => {
        if (index < comps.length - 1) {
          const item = comps[index]
          comps.splice(index, 1)
          comps.splice(index + 1, 0, item)
        }
      }
    }
  ])
}

// 🟢 核心函数 1: 数据清洗/升级 (Sanitizer)
// 负责把 { mass: 1 } 变成 { mass: { type: 'number', value: 1 } }
const populateDefaults = (schema: any, targetObj: any) => {
  if (!targetObj || typeof targetObj !== 'object') return

  for (const key in schema) {
    const def = schema[key]
    const storedItem = targetObj[key]

    // 准备默认值
    let defaultValue = def.default
    if (Array.isArray(defaultValue)) defaultValue = [...defaultValue]

    // 情况 A: 值不存在 -> 赋默认值
    if (storedItem === undefined) {
      targetObj[key] = { type: def.type, value: defaultValue }
      continue
    }

    // 情况 B: 值存在但未包装 (旧数据/刚添加的数据) -> 包装
    // 🚨 修复崩溃的关键：必须检查它是否已经是 Typed Object
    const isTyped = storedItem && typeof storedItem === 'object' && 'type' in storedItem && 'value' in storedItem
    if (!isTyped) {
      // 如果是 Vector3 (数组) 或者简单值，直接包装进 value
      targetObj[key] = { type: def.type, value: storedItem }
      continue
    }

    // 情况 C: 类型漂移 (Schema 改了，数据没改)
    if (storedItem.type !== def.type) {
      // 简单粗暴：类型不对就重置为默认值，防止渲染报错
      targetObj[key] = { type: def.type, value: defaultValue }
    } else {
      // 正常：更新类型字段
      storedItem.type = def.type 
    }
  }
}

// 🟢 核心函数 2: JIT (Just-In-Time) 配置获取
// Template 渲染时会频繁调用此函数，我们利用这个时机强制清洗数据
const getComponentConfig = (comp: any) => {
  let config = { schema: null as any, data: null as any };
  
  if (comp.type === 'Script') {
    // 脚本组件：Schema 来自文件加载，数据在 userValues
    config.schema = scriptSchemas[comp.props.src] || null
    config.data = comp.props.userValues || (comp.props.userValues = {})
  } else {
    // 内置组件：Schema 来自 NativeSchemas，数据在 props
    config.schema = NativeSchemas[comp.type] || null
    config.data = comp.props
  }

  // 🔥 关键修复：即时清洗！
  // 在把数据交给 Template 渲染之前，确保它已经被 populateDefaults 处理过。
  // 这样 Template 访问 .value 时永远是安全的，不会报 "undefined reading 0"。
  if (config.schema && config.data) {
    populateDefaults(config.schema, config.data)
  }

  return config
}

// 加载脚本 Schema
const loadScriptSchema = async (comp: any) => {
  if (comp.type !== 'Script' || !comp.props.src) return;
  if (scriptSchemas[comp.props.src]) return; 

  let fullPath = comp.props.src
  if (projectRoot && projectRoot.value && !fullPath.includes(':') && !fullPath.startsWith('/')) {
    try {
      // 🟢 2. 使用 FileSystem.pathJoin
      fullPath = await FileSystem.pathJoin(projectRoot.value, fullPath)
    } catch (e) {}
  }

  try {
    // 🟢 3. 使用 FileSystem.readFile
    const response = await FileSystem.readFile(fullPath)
    
    // 🟢 4. 检查 success
    if (!response.success) return

    const codeHeader = `const Behaviour = window.Behaviour; const PropType = window.PropType; const THREE = window.THREE;`
    
    // 🟢 5. 使用 .data (注意判空)
    const blob = new Blob([codeHeader + (response.data || '')], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    
    const module = await import(/* @vite-ignore */ blobUrl)
    URL.revokeObjectURL(blobUrl)

    if (module.default && module.default.schema) {
      scriptSchemas[comp.props.src] = module.default.schema
    }
  } catch (e) {
    console.error(`[Inspector] Failed to load script schema: ${fullPath}`, e)
  }
}

// 🟢 监听器：监听组件列表变化
// 主要是为了触发新添加的 "Script" 组件的 Schema 加载
watch(() => props.node?.components, (newComps) => {
  if (!newComps) return
  newComps.forEach(comp => {
    if (comp.type === 'Script') {
      loadScriptSchema(comp)
    }
    // 内置组件 (Mesh/RigidBody) 不需要预加载，getComponentConfig 会自动处理
  })
}, { deep: true, immediate: true })

</script>

<template>
  <div class="panel-content">
    <div class="panel-header">Inspector</div>
    
    <div class="inspector-body" v-if="node">
      
      <div class="header-section">
        <div class="active-checkbox">
          <input type="checkbox" v-model="node.active" title="Active" />
        </div>
        <div class="visible-checkbox" title="Visibility (Show/Hide)" style="margin-right: 8px;">
          <span 
            style="cursor: pointer; opacity: 0.7;" 
            @click="node.visible = !node.visible"
          >
            {{ node.visible !== false ? '👁️' : '🕶️' }}
          </span>
        </div>
        <div class="name-input-wrapper">
          <span class="icon">📦</span>
          <input v-model="node.name" class="name-input" />
        </div>
      </div>

      <div class="separator"></div>

      <div class="component-box">
         <div class="component-header">
          <span class="arrow">▼</span>
          <span class="title">Transform</span>
          <span class="menu" @click.stop="openTransformMenu">⋮</span>
        </div>
        <div class="component-content">
           <div class="prop-row"><div class="label">Position</div><div class="vector3-inputs">
              <div class="input-group x-axis"><span class="axis-label">X</span><input type="number" step="0.1" v-model.number="node.position[0]"></div>
              <div class="input-group y-axis"><span class="axis-label">Y</span><input type="number" step="0.1" v-model.number="node.position[1]"></div>
              <div class="input-group z-axis"><span class="axis-label">Z</span><input type="number" step="0.1" v-model.number="node.position[2]"></div>
           </div></div>
           <div class="prop-row"><div class="label">Rotation</div><div class="vector3-inputs">
              <div class="input-group x-axis"><span class="axis-label">X</span><input type="number" step="0.1" v-model.number="node.rotation[0]"></div>
              <div class="input-group y-axis"><span class="axis-label">Y</span><input type="number" step="0.1" v-model.number="node.rotation[1]"></div>
              <div class="input-group z-axis"><span class="axis-label">Z</span><input type="number" step="0.1" v-model.number="node.rotation[2]"></div>
           </div></div>
           <div class="prop-row"><div class="label">Scale</div><div class="vector3-inputs">
              <div class="input-group x-axis"><span class="axis-label">X</span><input type="number" step="0.1" v-model.number="node.scale[0]"></div>
              <div class="input-group y-axis"><span class="axis-label">Y</span><input type="number" step="0.1" v-model.number="node.scale[1]"></div>
              <div class="input-group z-axis"><span class="axis-label">Z</span><input type="number" step="0.1" v-model.number="node.scale[2]"></div>
           </div></div>
        </div>
      </div>

      <div class="separator"></div>

      <div v-for="(comp, idx) in node.components" :key="idx" class="component-box">
        
        <div class="component-header">
          <input type="checkbox" v-model="comp.active" @click.stop style="margin-right:8px;" />
          <span class="arrow">▼</span>
          <span class="title">{{ comp.type }}</span>
          <span v-if="comp.type === 'Script'" style="font-size:10px; color:#999; margin-left:10px;">
            {{ (comp.props.src as string)?.split('/').pop() || 'Empty' }}
          </span>
          <span class="menu" @click.stop="(e) => openComponentMenu(e, idx)">⋮</span>
        </div>

        <div class="component-content">
          <div v-if="comp.type === 'Script'" class="prop-row" style="margin-bottom: 8px;">
            <div class="label">Source</div>
            <input 
              class="simple-input" 
              v-model="comp.props.src" 
              placeholder="/scripts/MyScript.js"
              @change="loadScriptSchema(comp)" 
            />
          </div>
          
          <div v-if="comp.type === 'Script' && getComponentConfig(comp).schema" style="height:1px; background:#eee; margin:8px 0;"></div>

          <template v-if="getComponentConfig(comp).schema">
            <div 
              v-for="(def, key) in getComponentConfig(comp).schema" 
              :key="key" 
              class="prop-row"
            >
              <div class="label" :title="def.label || key">{{ def.label || key }}</div>
              
              <template v-if="getComponentConfig(comp).data[key]">
                <input 
                  v-if="def.type === 'number'" 
                  type="number" 
                  class="simple-input"
                  v-model.number="getComponentConfig(comp).data[key].value"
                  :step="def.step || 0.1" :min="def.min" :max="def.max"
                />

                <template v-else-if="def.type === 'string'">
                  <select v-if="def.options" v-model="getComponentConfig(comp).data[key].value" class="simple-input">
                    <option v-for="opt in def.options" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                  <input v-else type="text" class="simple-input" v-model="getComponentConfig(comp).data[key].value" />
                </template>

                <div v-else-if="def.type === 'boolean'" style="flex:1; display:flex; align-items:center;">
                   <input type="checkbox" v-model="getComponentConfig(comp).data[key].value" />
                </div>

                <div v-else-if="def.type === 'color'" class="color-input-wrapper">
                   <input type="color" v-model="getComponentConfig(comp).data[key].value" class="color-input">
                   <span class="color-value">{{ getComponentConfig(comp).data[key].value }}</span>
                </div>

                <div v-else-if="def.type === 'vector3'" class="vector3-inputs">
                  <div class="input-group x-axis">
                    <span class="axis-label">X</span>
                    <input type="number" step="0.1" v-model.number="getComponentConfig(comp).data[key].value[0]">
                  </div>
                  <div class="input-group y-axis">
                    <span class="axis-label">Y</span>
                    <input type="number" step="0.1" v-model.number="getComponentConfig(comp).data[key].value[1]">
                  </div>
                  <div class="input-group z-axis">
                    <span class="axis-label">Z</span>
                    <input type="number" step="0.1" v-model.number="getComponentConfig(comp).data[key].value[2]">
                  </div>
                </div>

                <div v-else-if="def.type === 'node'" style="flex:1;">
                  <NodePicker v-model:value="getComponentConfig(comp).data[key].value" :label="def.label" />
                </div>

              </template>
            </div>
          </template>

          <div v-else-if="comp.type === 'Script' && comp.props.src" style="color:#999; font-size:10px; text-align:center; padding:4px;">
            Loading or Parsing...
          </div>
        </div>
      </div>

      <InspectorAddComponent :node="node" />

    </div>
    
    <div v-else class="empty-state">
      <div class="empty-icon">∅</div>
      <div>No Selection</div>
    </div>
  </div>
</template>

<style scoped>
/* 样式保持原样，没有任何变化 */
.panel-content { display: flex; flex-direction: column; height: 100%; font-family: 'Segoe UI', sans-serif; }
.panel-header {
  height: 36px; line-height: 36px; padding-left: 15px;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  background: #f1f3f5; color: #666; border-bottom: 1px solid #e0e0e0;
  user-select: none;
}
.inspector-body { padding: 15px; flex: 1; overflow-y: auto; }
.header-section { display: flex; align-items: center; margin-bottom: 10px; }
.active-checkbox { margin-right: 10px; }
.name-input-wrapper { 
  flex: 1; display: flex; align-items: center; 
  background: #fff; border: 1px solid #dcdfe6; border-radius: 4px; padding: 4px 8px; 
}
.name-input-wrapper .icon { margin-right: 6px; font-size: 14px; }
.name-input { border: none; outline: none; width: 100%; font-size: 13px; font-weight: 600; color: #333; }
.separator { height: 1px; background: #e0e0e0; margin: 15px 0; }
.component-box { background: #fafafa; border: 1px solid #e0e0e0; border-radius: 4px; margin-bottom: 10px; overflow: hidden; }
.component-header {
  background: #f5f7fa; padding: 6px 10px; border-bottom: 1px solid #e0e0e0;
  display: flex; align-items: center; font-size: 12px; font-weight: 600; color: #444; cursor: pointer;
}
.component-header .arrow { margin-right: 5px; font-size: 10px; color: #888; }
.component-header .title { flex: 1; }
.component-header .menu { 
  margin-left: 5px; padding: 0 5px; color: #888; font-size: 16px;
  cursor: pointer; user-select: none;
}
.component-header .menu:hover { color: #333; }
.component-content { padding: 10px; background: #fff; }
.prop-row { display: flex; align-items: center; margin-bottom: 8px; }
.prop-row:last-child { margin-bottom: 0; }
.label { width: 70px; font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 5px; }
.vector3-inputs { flex: 1; display: flex; gap: 4px; }
.input-group { 
  flex: 1; display: flex; align-items: center; 
  background: #f5f7fa; border: 1px solid #dcdfe6; border-radius: 3px; 
  transition: border-color 0.2s;
}
.input-group:focus-within { border-color: #409eff; background: #fff; }
.axis-label { font-size: 10px; padding: 0 4px; cursor: ew-resize; font-weight: bold; user-select: none; }
.x-axis .axis-label { color: #f56c6c; }
.y-axis .axis-label { color: #67c23a; }
.z-axis .axis-label { color: #409eff; }
.input-group input {
  width: 100%; border: none; background: transparent; outline: none;
  font-size: 11px; color: #333; padding: 4px 2px; -moz-appearance: textfield;
}
.input-group input::-webkit-outer-spin-button, .input-group input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.simple-input {
  flex: 1; background: #f5f7fa; border: 1px solid #dcdfe6; border-radius: 3px;
  padding: 4px 6px; font-size: 11px; color: #333; outline: none; min-height: 22px; width: 0; /* fix flex overflow */
}
.simple-input:focus { border-color: #409eff; background: #fff; }
.simple-input[type="number"] { text-align: right; }
.color-input-wrapper { flex: 1; display: flex; align-items: center; gap: 8px; }
.color-input { width: 30px; height: 22px; border: 1px solid #dcdfe6; border-radius: 3px; padding: 0; cursor: pointer; }
.color-value { font-size: 11px; color: #666; font-family: 'Monaco', 'Consolas', monospace; user-select: all; }
input[type="checkbox"] { margin: 0; width: 14px; height: 14px; cursor: pointer; }
select.simple-input {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat; background-position: right 6px center; background-size: 12px; padding-right: 25px;
}
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: #aaa; font-size: 13px; }
.empty-icon { font-size: 30px; margin-bottom: 10px; opacity: 0.5; }
</style>