<script setup lang="ts">
import { onUnmounted, shallowRef, watch, inject } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { AssetManager } from '../engine/AssetManager'
const csmSetupMaterial = inject<(mat: THREE.Material) => void>('csm-setup-material', () => {})

const props = defineProps<{
  nodeId: string
  src: string
  defaultAnimation?: string 
  speed?: number
}>()

const projectRoot = inject('project-root') as any
const modelRef = shallowRef<THREE.Object3D | null>(null)
let mixer: THREE.AnimationMixer | null = null
let currentAction: THREE.AnimationAction | null = null // 记录当前动作，用于混合

const { onBeforeRender } = useLoop()

// 每一帧更新混合器
onBeforeRender(({ delta }) => {
  if (mixer) {
    mixer.update(delta * (props.speed ?? 1.0))
  }
})

// --- 🟢 核心 API 定义 ---
const api = {
  /**
   * 播放动画
   * @param name 动画名称
   * @param transitionDuration 过渡时间(秒)，默认 0 (瞬间切换)
   * @param loop 是否循环，默认 true
   */
  play: (name: string, transitionDuration: number = 0, loop: boolean = true) => {
    if (!mixer || !modelRef.value) return

    const animations = modelRef.value.userData.animations || []
    const clip = animations.find((c: any) => c.name === name)
    
    if (!clip) {
      console.warn(`[Animator] ⚠️ 未找到动画: "${name}"。可用动画:`, animations.map((c:any) => c.name))
      return
    }

    // 防止重复播放同一个正在跑的动画
    if (currentAction && currentAction.getClip().name === name && currentAction.isRunning()) {
      return
    }

    // 1. 获取动作实例
    const newAction = mixer.clipAction(clip)
    
    // 2. 设置循环模式
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    newAction.clampWhenFinished = !loop //如果不循环，播完停在最后一帧

    // 3. 执行过渡逻辑
    if (currentAction && currentAction !== newAction) {
      if (transitionDuration > 0) {
        // 淡出旧的，淡入新的
        currentAction.fadeOut(transitionDuration)
        newAction.reset().fadeIn(transitionDuration).play()
      } else {
        // 硬切
        currentAction.stop()
        newAction.reset().play()
      }
    } else {
      // 第一次播放，或者没有旧动作
      newAction.reset().play()
    }

    currentAction = newAction
  },

  /** 停止所有动画 */
  stop: () => {
    if (mixer) mixer.stopAllAction()
    currentAction = null
  },

  /** 获取当前正在播放的动画名 */
  getCurrentAnimation: () => {
    return currentAction ? currentAction.getClip().name : null
  },

  /** 设置特定动画的时间缩放 (速度) */
  setTimeScale: (speed: number) => {
    if (mixer) mixer.timeScale = speed
  }
}

// 加载逻辑
const initModel = async () => {
  // 清理
  if (mixer) { mixer.stopAllAction(); mixer = null; }
  modelRef.value = null
  currentAction = null

  if (!props.src || !projectRoot.value) return

  // 1. 加载
  const object = await AssetManager.loadModel(projectRoot.value, props.src)
  if (!object) return

  // 2. 阴影
  object.traverse((c) => { 
    if((c as THREE.Mesh).isMesh) { 
      c.castShadow = true; 
      c.receiveShadow = true; 
      
      // 🟢 2. 注册材质到 CSM (新增)
      if ((c as THREE.Mesh).material) {
        // 处理材质数组的情况 (有些模型一个 Mesh 有多个材质)
        const materials = Array.isArray((c as THREE.Mesh).material) 
          ? (c as THREE.Mesh).material 
          : [(c as THREE.Mesh).material];
          
        (materials as THREE.Material[]).forEach(mat => {
          csmSetupMaterial(mat)
        })
      }
    } 
  })
  
  modelRef.value = object

  // 3. 初始化动画系统
  const animations = object.userData.__animations || []
  
  if (animations.length > 0) {
    // 打印列表方便调试
    console.groupCollapsed(`[SkinnedModel] 🎬 动画列表: ${props.src.split('/').pop()}`)
    console.log(animations.map((c: any) => c.name))
    console.groupEnd()

    mixer = new THREE.AnimationMixer(object)
    
    // 🟢 挂载数据和 API 到 userData
    object.userData.animations = animations
    object.userData.animator = api  // <--- 关键！脚本将通过这个拿到 API

    // 如果面板里填了默认动画，尝试自动播放
    if (props.defaultAnimation) {
      api.play(props.defaultAnimation, 0.2) // 默认给一点点过渡，防止硬切太丑
    }
  }
}

watch(() => props.src, initModel, { immediate: true })

// 依然监听面板输入，方便在编辑器里预览
watch(() => props.defaultAnimation, (newAnim) => {
  if (newAnim) api.play(newAnim, 0.2)
})

defineExpose(api)

onUnmounted(() => {
  if (mixer) mixer.stopAllAction()
})
</script>

<template>
  <primitive v-if="modelRef" :object="modelRef" />
</template>