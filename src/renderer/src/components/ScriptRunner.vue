<script setup lang="ts">
import { inject, onUnmounted, watch, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
// 注意：这里导入只是为了类型定义，实际运行时用的是 window.Behaviour
import { Behaviour, ScriptManager } from '../engine/Engine' 
import { FileSystem } from '../engine/FileSystem'

const props = defineProps<{
  nodeId: string
  scriptPath: string
  userValues: Record<string, any>
  component: any
}>()

const registry = inject<any>('scene-registry')
const isPlaying = inject('is-playing', { value: false })

const scriptInstance = shallowRef<Behaviour | null>(null)
const { onBeforeRender } = useLoop()

const flattenUserValues = (rawValues: Record<string, any>) => {
  if (!rawValues) return {}
  
  const flattened: Record<string, any> = {}
  
  for (const key in rawValues) {
    const item = rawValues[key]
    
    // 判断是否为新结构 (包含 type 和 value)
    if (item && typeof item === 'object' && 'type' in item && 'value' in item) {
      flattened[key] = item.value
    } else {
      // 兼容旧结构 (如果有些数据还没被 Inspector 转换过)
      flattened[key] = item
    }
  }
  
  return flattened
}

// 🟢 辅助函数：等待物体注册成功 (最多等 3 秒)
const waitForObject = async (id: string, maxAttempts = 30): Promise<THREE.Object3D | null> => {
  for (let i = 0; i < maxAttempts; i++) {
    const obj = registry.get(id)
    if (obj) return obj
    // 没找到？等 100ms 再试
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return null
}

const projectRoot = inject('project-root') as any

const loadScript = async () => {
  if (!props.scriptPath || !isPlaying.value) return;

  try {
    // 🟢 1. 路径处理：支持相对路径
    let fullPath = props.scriptPath
    
    // 如果存在项目根目录，且用户填写的看起来是相对路径（不含冒号，不以/开头），则拼接
    if (projectRoot && projectRoot.value) {
      // 简单判断是否为绝对路径 (根据你的系统环境微调)
      const isAbsolute = props.scriptPath.startsWith('/') || props.scriptPath.indexOf(':') > 0;
      
      if (!isAbsolute) {
        // 调用主进程拼接路径 (解决 Windows/Mac 斜杠差异)
        fullPath = await FileSystem.pathJoin(projectRoot.value, props.scriptPath)
      }
    }

    console.log(`[Script] 🚀 Initializing: ${fullPath}`)

    // 🟢 2. 读取文件
    const response = await FileSystem.readFile(fullPath)
    if (!response.success) {
      // 注意：我们的 FileSystem 封装统一了 error 字段
      console.error(`[Script] ❌ Read error: ${response.error}`)
      return
    }

    let scriptContent = response.data

    // 🟢 3. 稳健注入：手动在代码头部加上变量声明
    // 确保脚本内可以直接使用 Behaviour, PropType, THREE 等
    // (如果你在 Engine.ts 里把 Input 和 Time 也挂载到了 window，建议在这里也加上 const Input = window.Input;)
    const headerInjection = `
      const Behaviour = window.Behaviour; 
      const PropType = window.PropType;
      const THREE = window.THREE;
      const Input = window.Input;
      const Time = window.Time;
      const RAPIER = window.RAPIER;
      const Global = window.Global;
      const Wait = window.Wait;
    `;
    
    // sourceURL 使用短路径，方便在 DevTools 里辨识
    const sourceMap = `\n//# sourceURL=${props.scriptPath}`
    
    const finalCode = headerInjection + scriptContent + sourceMap

    // 🟢 4. 创建 Blob 并导入
    const blob = new Blob([finalCode], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    
    // 动态 Import
    const module = await import(/* @vite-ignore */ blobUrl)
    URL.revokeObjectURL(blobUrl) // 释放内存
    
    const ScriptClass = module.default;
    if (!ScriptClass) {
      console.error(`[Script] ❌ No default export found in ${fullPath}`)
      return
    }

    // 🟢 5. 核心：等待 3D 物体注册完毕
    const gameObject = await waitForObject(props.nodeId)
    
    if (!gameObject) {
      console.error(`[Script] ❌ Timeout: GameObject ${props.nodeId} never registered!`)
      return
    }

    console.log(`[Script] ✅ Object found: ${gameObject.name}. Instantiating script...`)

    // 🟢 6. 实例化与生命周期
    const instance = new ScriptClass(gameObject, props.component)
    
    // ========== 🟢 新增部分：挂载实例供物理系统使用 ==========
    // 这一步是为了让 PhysicsSystem 在分发事件时，
    // 能通过 object3D.userData.scripts 找到这个脚本实例
    if (!gameObject.userData.scripts) {
      gameObject.userData.scripts = []
    }
    gameObject.userData.scripts.push(instance)
    // ======================================================

    // 注入 Inspector 面板的数据
    if (props.userValues) {
      instance.inputs = flattenUserValues(props.userValues)
    }
    
    // 调用 onStart
    const success = ScriptManager.tryStart(instance);
    if (success) {
      ScriptManager.checkPending();
    }
    
    scriptInstance.value = instance

  } catch (e) {
    console.error(`[Script] 💥 Failed to load ${props.scriptPath}`, e)
  }
}

watch(() => isPlaying.value, (playing) => {
  if (playing) {
    loadScript()
  } else {
    if (scriptInstance.value?.onDestroy) {
      try {
        scriptInstance.value.onDestroy()
      } catch (e) { console.error(e) }
    }
    scriptInstance.value = null
  }
}, { immediate: true })

watch(() => props.userValues, (newVals) => {
  if (scriptInstance.value) {
    Object.assign(scriptInstance.value.inputs, flattenUserValues(newVals))
  }
}, { deep: true })

onBeforeRender(({ delta, elapsed }) => {
  // 如果组件被禁用 (active === false)，直接 return，不跑 Update
  if (props.component.active === false) return;

  if (scriptInstance.value && isPlaying.value) {
    try {
      if (scriptInstance.value.onUpdate) {
        scriptInstance.value.onUpdate(delta, elapsed)
      }
    } catch (e) {
        console.error(e)
     }
  }
})
</script>

<template>
  </template>