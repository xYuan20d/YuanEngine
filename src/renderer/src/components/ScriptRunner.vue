<script setup lang="ts">
import { inject, onUnmounted, watch, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
// 注意：这里导入只是为了类型定义，实际运行时用的是 window.Behaviour
import { Behaviour } from '../engine/Engine' 

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
        fullPath = await window.fileSystem.pathJoin(projectRoot.value, props.scriptPath)
      }
    }

    console.log(`[Script] 🚀 Initializing: ${fullPath}`)

    // 🟢 2. 读取文件
    const response = await window.fileSystem.readFile(fullPath)
    if (!response.success) {
      console.error(`[Script] ❌ Read error: ${response.error}`)
      return
    }

    let scriptContent = response.content

    // 🟢 3. 稳健注入：手动在代码头部加上变量声明
    // 确保脚本内可以直接使用 Behaviour, PropType, THREE 等
    const headerInjection = `
      const Behaviour = window.Behaviour; 
      const PropType = window.PropType;
      const THREE = window.THREE;
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
    
    // 注入 Inspector 面板的数据
    if (props.userValues) {
      instance.inputs = { ...props.userValues }
    }
    
    // 调用 onStart
    if (instance.onStart) {
      try {
        instance.onStart()
      } catch (e) {
        console.error(`[Script] Error in onStart (${props.scriptPath}):`, e)
      }
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
    Object.assign(scriptInstance.value.inputs, newVals)
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