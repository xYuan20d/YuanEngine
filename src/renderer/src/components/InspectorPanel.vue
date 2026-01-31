<script setup lang="ts">
import { defineProps, reactive, watch, inject } from 'vue'
import { IGameNode } from '../types/schema'
import InspectorAddComponent from './InspectorAddComponent.vue' // [新增] 引入组件
import NodePicker from './properties/NodePicker.vue'

// 接收完整的 Node 对象
const props = defineProps<{
  node: IGameNode | null | undefined
}>()

const scriptSchemas = reactive({}) // 缓存 schema: { 'path/to/script.js': { speed: ... } }

const projectRoot = inject('project-root') as any

const loadSchema = async (comp: any) => {
  // 1. 基础校验
  if (comp.type !== 'Script' || !comp.props.src) return;

  // 2. 路径处理：支持相对路径拼接
  let fullPath = comp.props.src
  // 如果有项目根目录，且 src 看起来像相对路径 (不包含冒号，不以斜杠开头 - 简易判断)
  // 注意：Windows 绝对路径包含 ':', Unix 绝对路径以 '/' 开头
  if (projectRoot && projectRoot.value && !fullPath.includes(':') && !fullPath.startsWith('/')) {
    try {
      // 优先调用 preload 里的 pathJoin (更稳健)
      if (window.fileSystem && window.fileSystem.pathJoin) {
        fullPath = await window.fileSystem.pathJoin(projectRoot.value, fullPath)
      } else {
        // Fallback 拼接
        fullPath = `${projectRoot.value}/${fullPath}`.replace(/\\/g, '/')
      }
    } catch (e) {
      console.info('Path join failed, trying raw path', e)
    }
  }

  // 3. 内部辅助函数：给组件补全默认值 (Populate Defaults)
  // 这是修复 "Cannot read properties of undefined" 的关键
  const populateDefaults = (schema: any) => {
    if (!comp.props.userValues) comp.props.userValues = {}
    
    const defaults: any = {}
    for (const key in schema) {
      const val = schema[key].default
      // 深度复制默认值 (防止所有物体共享同一个数组引用，特别是 Vector3)
      defaults[key] = Array.isArray(val) ? [...val] : val
    }
    
    // 合并：保留用户已修改的值，补全缺失的默认值
    comp.props.userValues = { ...defaults, ...comp.props.userValues }
  }

  // 4. 情况A：Schema 已缓存
  // 即使缓存了，也要为当前这个新挂载的组件填充默认值！
  if (scriptSchemas[comp.props.src]) {
    populateDefaults(scriptSchemas[comp.props.src])
    return
  }

  // 5. 情况B：Schema 未缓存 (需要加载)
  try {
    const response = await window.fileSystem.readFile(fullPath)
    if (!response.success) {
      console.warn(`[Inspector] Failed to read script: ${fullPath}`, response.error)
      return
    }

    // 注入全局变量声明，确保 Blob 环境能找到基类
    const codeHeader = `
      const Behaviour = window.Behaviour;
      const PropType = window.PropType;
      const THREE = window.THREE;
    `
    const finalCode = codeHeader + response.content

    // Blob 处理
    const blob = new Blob([finalCode], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    
    // 动态导入
    const module = await import(/* @vite-ignore */ blobUrl)
    URL.revokeObjectURL(blobUrl)

    if (module.default && module.default.schema) {
      const schema = module.default.schema
      
      // A. 先填充数据 (重要！先有数据再让 UI 渲染，防止报错)
      populateDefaults(schema)
      
      // B. 再更新 Schema 缓存 (这会触发 v-if="scriptSchemas[...]" 变为 true)
      scriptSchemas[comp.props.src] = schema
    }
  } catch (e) {
    console.error(`[Inspector] Failed to parse script schema: ${fullPath}`, e)
  }
}

// 监听选中节点变化，加载所有 Script 组件的 Schema
watch(() => props.node?.id, (newId) => {
  if (newId && props.node) {
    // 只有当切换选中物体时，才扫描一遍所有组件
    props.node.components.forEach(c => loadSchema(c))
  }
}, { immediate: true })
</script>

<template>
  <div class="panel-content">
    <div class="panel-header">Inspector</div>
    
    <div class="inspector-body" v-if="node">
      
      <div class="header-section">
        <div class="active-checkbox">
          <input type="checkbox" v-model="node.active" title="Active" />
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
          <span class="menu">⋮</span>
        </div>
        <div class="component-content">
           <div class="prop-row">
            <div class="label" title="Position">Position</div>
            <div class="vector3-inputs">
              <div class="input-group x-axis">
                <span class="axis-label">X</span>
                <input type="number" step="0.1" v-model.number="node.position[0]">
              </div>
              <div class="input-group y-axis">
                <span class="axis-label">Y</span>
                <input type="number" step="0.1" v-model.number="node.position[1]">
              </div>
              <div class="input-group z-axis">
                <span class="axis-label">Z</span>
                <input type="number" step="0.1" v-model.number="node.position[2]">
              </div>
            </div>
          </div>
           <div class="prop-row">
            <div class="label" title="Rotation">Rotation</div>
            <div class="vector3-inputs">
              <div class="input-group x-axis">
                <span class="axis-label">X</span>
                <input type="number" step="0.1" v-model.number="node.rotation[0]">
              </div>
              <div class="input-group y-axis">
                <span class="axis-label">Y</span>
                <input type="number" step="0.1" v-model.number="node.rotation[1]">
              </div>
              <div class="input-group z-axis">
                <span class="axis-label">Z</span>
                <input type="number" step="0.1" v-model.number="node.rotation[2]">
              </div>
            </div>
          </div>
           <div class="prop-row">
            <div class="label" title="Scale">Scale</div>
            <div class="vector3-inputs">
              <div class="input-group x-axis">
                <span class="axis-label">X</span>
                <input type="number" step="0.1" v-model.number="node.scale[0]">
              </div>
              <div class="input-group y-axis">
                <span class="axis-label">Y</span>
                <input type="number" step="0.1" v-model.number="node.scale[1]">
              </div>
              <div class="input-group z-axis">
                <span class="axis-label">Z</span>
                <input type="number" step="0.1" v-model.number="node.scale[2]">
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="separator"></div>

      <div v-for="(comp, idx) in node.components" :key="idx" class="component-box">
        <div class="component-header">
          
          <input 
            type="checkbox" 
            v-model="comp.active" 
            @click.stop 
            style="margin-right: 8px;"
          />

          <span class="arrow">▼</span>
          <span class="title">{{ comp.type }}</span>
          <span class="menu">⋮</span>
        </div>
        
        <div v-if="comp.type === 'Camera'" class="component-content">
             <div class="prop-row">
            <div class="label" style="width: 80px">Is Main</div>
            <input type="checkbox" v-model="comp.props.isMain">
          </div>
          <div class="prop-row">
            <div class="label" style="width: 80px">FOV</div>
            <input class="simple-input" type="number" v-model.number="comp.props.fov" min="1" max="179">
          </div>
          <div class="prop-row">
            <div class="label" style="width: 80px">Near</div>
            <input class="simple-input" type="number" step="0.1" v-model.number="comp.props.near" min="0.01">
          </div>
          <div class="prop-row">
            <div class="label" style="width: 80px">Far</div>
            <input class="simple-input" type="number" v-model.number="comp.props.far" min="0.1">
          </div>
        </div>

        <div v-else-if="comp.type === 'Light'" class="component-content">
             <div class="prop-row">
            <div class="label" style="width: 80px">Intensity</div>
            <input class="simple-input" type="number" step="0.1" v-model.number="comp.props.intensity" min="0">
          </div>
          <div class="prop-row">
            <div class="label" style="width: 80px">Color</div>
            <div class="color-input-wrapper">
              <input type="color" v-model="comp.props.color" class="color-input">
              <span class="color-value">{{ comp.props.color }}</span>
            </div>
          </div>
        </div>
        
        <div v-else-if="comp.type === 'Mesh'" class="component-content">
             <div class="prop-row">
            <div class="label" style="width: 80px">Geometry</div>
            <select v-model="comp.props.geometry" class="simple-input">
              <option value="Box">Box</option>
              <option value="Sphere">Sphere</option>
              <option value="Cylinder">Cylinder</option>
              <option value="Plane">Plane</option>
            </select>
          </div>
          <div class="prop-row">
            <div class="label" style="width: 80px">Color</div>
            <div class="color-input-wrapper">
              <input type="color" v-model="comp.props.color" class="color-input">
              <span class="color-value">{{ comp.props.color }}</span>
            </div>
          </div>
        </div>

        <div v-else-if="comp.type === 'VehicleChassis'" class="component-content">
          <div class="prop-row">
            <div class="label" title="Center of Mass Offset (x, y, z)">CoM Offset</div>
            <div class="vector3-inputs">
              <div class="input-group x-axis">
                <span class="axis-label">X</span>
                <input type="number" step="0.1" 
                  :value="comp.props.centerOfMassOffset?.[0] ?? 0"
                  @input="e => { if(!comp.props.centerOfMassOffset) comp.props.centerOfMassOffset=[0,0,0]; comp.props.centerOfMassOffset[0] = parseFloat((e.target as any).value) }"
                >
              </div>
              <div class="input-group y-axis">
                <span class="axis-label">Y</span>
                <input type="number" step="0.1" 
                  :value="comp.props.centerOfMassOffset?.[1] ?? 0"
                  @input="e => { if(!comp.props.centerOfMassOffset) comp.props.centerOfMassOffset=[0,0,0]; comp.props.centerOfMassOffset[1] = parseFloat((e.target as any).value) }"
                >
              </div>
              <div class="input-group z-axis">
                <span class="axis-label">Z</span>
                <input type="number" step="0.1" 
                  :value="comp.props.centerOfMassOffset?.[2] ?? 0"
                  @input="e => { if(!comp.props.centerOfMassOffset) comp.props.centerOfMassOffset=[0,0,0]; comp.props.centerOfMassOffset[2] = parseFloat((e.target as any).value) }"
                >
              </div>
            </div>
          </div>
          <div class="prop-info" style="font-size:10px; color:#999; margin-top:4px;">
            Tip: Set Y to -0.5 or lower to prevent flipping.
          </div>
        </div>

        <div v-else-if="comp.type === 'VehicleWheel'" class="component-content">
          <div class="prop-row">
            <div class="label">Is Steering</div>
            <input type="checkbox" v-model="comp.props.isSteering">
          </div>
          <div class="prop-row">
            <div class="label">Is Drive</div>
            <input type="checkbox" v-model="comp.props.isDrive">
          </div>
          
          <div style="height:1px; background:#eee; margin:5px 0;"></div>

          <div class="prop-row">
            <div class="label" title="Radius Scale">Rad Scale</div>
            <input class="simple-input" type="number" step="0.1" v-model.number="comp.props.radiusScale">
          </div>
          <div class="prop-row">
            <div class="label" title="Suspension Rest Length">Sus Length</div>
            <input class="simple-input" type="number" step="0.05" v-model.number="comp.props.suspensionRestLength">
          </div>
          <div class="prop-row">
            <div class="label" title="Suspension Stiffness">Stiffness</div>
            <input class="simple-input" type="number" step="1" v-model.number="comp.props.suspensionStiffness">
          </div>
          <div class="prop-row">
             <div class="label" title="Max Travel">Max Travel</div>
             <input class="simple-input" type="number" step="0.05" v-model.number="comp.props.maxSuspensionTravel">
          </div>
        </div>

        <div v-else-if="comp.type === 'RigidBody'" class="component-content">

          <div class="prop-row">
            <div class="label" title="Is Trigger (Sensor)">Is Trigger</div>
            <input type="checkbox" v-model="comp.props.isTrigger">
          </div>
          
          <div style="height:1px; background:#eee; margin:5px 0;"></div>

          <div class="prop-row">
            <div class="label" title="Collider Shape">Shape</div>
            <select v-model="comp.props.colliderType" class="simple-input">
              <option value="primitive">Primitive (极速/规则)</option>
              <option value="hull">Convex Hull (精准/动态)</option>
              <option value="trimesh">Trimesh (1:1/静态)</option>
            </select>
          </div>
      
          <div class="prop-row">
            <div class="label" title="Body Type">Type</div>
            <select v-model="comp.props.bodyType" class="simple-input">
              <option value="dynamic">Dynamic (受重力)</option>
              <option value="fixed">Fixed (静止/墙)</option>
              <option value="kinematicPositionBased">Kinematic (代码控制)</option>
            </select>
          </div>

          <div class="prop-row">
            <div class="label" title="Mass">Mass (kg)</div>
            <input 
              type="number" 
              step="0.1" 
              v-model.number="comp.props.mass" 
              class="simple-input" 
            />
          </div>

          <div class="prop-row">
            <div class="label" title="Bounciness (0=泥巴, 1=弹力球)">Bounce</div>
            <div style="flex: 1; display: flex; align-items: center;">
              <input 
                type="range" min="0" max="1" step="0.1" 
                v-model.number="comp.props.restitution" 
                style="flex: 1; margin-right: 8px;"
              />
              <span style="font-size: 11px; width: 24px;">{{ comp.props.restitution }}</span>
            </div>
          </div>

          <div class="prop-row">
            <div class="label" title="Friction (0=滑冰, 1=砂纸)">Friction</div>
            <div style="flex: 1; display: flex; align-items: center;">
              <input 
                type="range" min="0" max="1" step="0.1" 
                v-model.number="comp.props.friction" 
                style="flex: 1; margin-right: 8px;"
              />
              <span style="font-size: 11px; width: 24px;">{{ comp.props.friction }}</span>
            </div>
          </div>

        </div>

        <div v-else-if="comp.type === 'Script'" class="component-content">
             <div class="prop-row">
            <div class="label" style="width: 80px">Script</div>
            <input 
              class="simple-input" 
              v-model="comp.props.src" 
              placeholder="/scripts/MyScript.js"
              @change="loadSchema(comp)" 
            />
          </div>

          <div style="height: 1px; background: #eee; margin: 8px 0;" v-if="scriptSchemas[comp.props.src]"></div>

          <div v-if="scriptSchemas[comp.props.src]" class="script-params">
            <div 
              v-for="(def, key) in scriptSchemas[comp.props.src]" 
              :key="key" 
              class="prop-row"
            >
              <div class="label" style="width: 80px; text-transform: capitalize;" :title="key">
                {{ def.label || key }}
              </div>
              
              <input 
                v-if="def.type === 'number'" 
                class="simple-input"
                type="number" 
                v-model.number="comp.props.userValues[key]"
                :step="def.step || 0.1"
                :min="def.min"
                :max="def.max"
              />

              <div v-else-if="def.type === 'boolean'" style="flex:1; display:flex; align-items:center;">
                 <input type="checkbox" v-model="comp.props.userValues[key]" />
              </div>

              <input 
                v-else-if="def.type === 'string'" 
                class="simple-input"
                type="text" 
                v-model="comp.props.userValues[key]"
              />

              <div v-else-if="def.type === 'vector3'" class="vector3-inputs">
                <div class="input-group x-axis">
                  <span class="axis-label">X</span>
                  <input type="number" step="0.1" v-model.number="comp.props.userValues[key][0]">
                </div>
                <div class="input-group y-axis">
                  <span class="axis-label">Y</span>
                  <input type="number" step="0.1" v-model.number="comp.props.userValues[key][1]">
                </div>
                <div class="input-group z-axis">
                  <span class="axis-label">Z</span>
                  <input type="number" step="0.1" v-model.number="comp.props.userValues[key][2]">
                </div>
              </div>

              <div v-else-if="def.type === 'node'" style="flex:1;">
                <NodePicker 
                  v-model:value="comp.props.userValues[key]" 
                  :label="def.label || key"
                />
              </div>

            </div>
          </div>
          
          <div v-else-if="comp.props.src" style="color: #999; font-size: 10px; padding: 4px; text-align: center;">
             ...
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
/* 面板整体布局 */
.panel-content { display: flex; flex-direction: column; height: 100%; font-family: 'Segoe UI', sans-serif; }
.panel-header {
  height: 36px; line-height: 36px; padding-left: 15px;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  background: #f1f3f5; color: #666; border-bottom: 1px solid #e0e0e0;
  user-select: none;
}
.inspector-body { padding: 15px; flex: 1; overflow-y: auto; }

/* 1. Header Section (Name & Active) */
.header-section { display: flex; align-items: center; margin-bottom: 10px; }
.active-checkbox { margin-right: 10px; }
.name-input-wrapper { 
  flex: 1; display: flex; align-items: center; 
  background: #fff; border: 1px solid #dcdfe6; border-radius: 4px; padding: 4px 8px; 
}
.name-input-wrapper .icon { margin-right: 6px; font-size: 14px; }
.name-input { border: none; outline: none; width: 100%; font-size: 13px; font-weight: 600; color: #333; }
.separator { height: 1px; background: #e0e0e0; margin: 15px 0; }

/* 2. Component Box Style */
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

/* 3. Property Row (Label + Inputs) */
.prop-row { display: flex; align-items: center; margin-bottom: 8px; }
.prop-row:last-child { margin-bottom: 0; }
.label { width: 60px; font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis; }

/* Vector3 Inputs */
.vector3-inputs { flex: 1; display: flex; gap: 4px; }
.input-group { 
  flex: 1; display: flex; align-items: center; 
  background: #f5f7fa; border: 1px solid #dcdfe6; border-radius: 3px; 
  transition: border-color 0.2s;
}
.input-group:focus-within { border-color: #409eff; background: #fff; }

.axis-label {
  font-size: 10px; padding: 0 4px; cursor: ew-resize; font-weight: bold;
  user-select: none;
}
/* Unity Style Colors */
.x-axis .axis-label { color: #f56c6c; } /* Red */
.y-axis .axis-label { color: #67c23a; } /* Green */
.z-axis .axis-label { color: #409eff; } /* Blue */

.input-group input {
  width: 100%; border: none; background: transparent; outline: none;
  font-size: 11px; color: #333; padding: 4px 2px;
  /* 移除数字输入框的默认箭头 */
  -moz-appearance: textfield;
}
.input-group input::-webkit-outer-spin-button,
.input-group input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

/* Simple Input */
.simple-input {
  flex: 1;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 11px;
  color: #333;
  outline: none;
  min-height: 22px;
}
.simple-input:focus { border-color: #409eff; background: #fff; }
.simple-input[type="number"] {
  text-align: right;
}

/* Color Input */
.color-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
.color-input {
  width: 30px;
  height: 22px;
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  padding: 0;
  cursor: pointer;
}
.color-value {
  font-size: 11px;
  color: #666;
  font-family: 'Monaco', 'Consolas', monospace;
  user-select: all;
}

/* Raw JSON Display */
.raw-json pre {
  margin: 0;
  font-size: 10px;
  line-height: 1.4;
  color: #999;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 200px;
  overflow-y: auto;
  background: #f9f9f9;
  padding: 8px;
  border-radius: 3px;
  border: 1px solid #eee;
}

/* Checkbox Styling */
input[type="checkbox"] {
  margin: 0;
  width: 14px;
  height: 14px;
  cursor: pointer;
}

/* Select Styling */
select.simple-input {
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 12px;
  padding-right: 25px;
}

/* Add Component Button */
.add-component-btn {
  width: 100%; padding: 8px; margin-top: 10px;
  background: #fff; border: 1px solid #dcdfe6; border-radius: 4px;
  color: #606266; font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.add-component-btn:hover { border-color: #409eff; color: #409eff; background: #ecf5ff; }

/* Empty State */
.empty-state { 
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 200px; color: #aaa; font-size: 13px; 
}
.empty-icon { font-size: 30px; margin-bottom: 10px; opacity: 0.5; }
</style>