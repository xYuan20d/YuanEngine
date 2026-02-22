// src/engine/AssetManager.ts
import { FileSystem } from './FileSystem'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
// 🟢 1. 引入这一行救命代码
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

const modelCache = new Map<string, any>()
const loadingPromises = new Map<string, Promise<any>>()

const gltfLoader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
dracoLoader.setDecoderConfig({ type: 'js' })
gltfLoader.setDRACOLoader(dracoLoader)

export const AssetManager = {
  async loadModel(projectRoot: string, relativePath: string): Promise<THREE.Object3D | null> {
    const cacheKey = `${projectRoot}/${relativePath}`

    // 1. 缓存检查
    if (modelCache.has(cacheKey)) {
      const cachedScene = modelCache.get(cacheKey)
      // 🟢 2. 使用 SkeletonUtils 克隆缓存的对象
      const cloned = SkeletonUtils.clone(cachedScene)
      
      // 恢复动画引用
      if (cachedScene.userData?.__animations) {
        cloned.userData.__animations = cachedScene.userData.__animations
      }
      return cloned
    }

    // 2. 避免并发
    if (loadingPromises.has(cacheKey)) {
      const result = await loadingPromises.get(cacheKey)
      // 🟢 2. 使用 SkeletonUtils 克隆
      const cloned = SkeletonUtils.clone(result)
      if (cloned && result.userData?.__animations) {
        cloned.userData.__animations = result.userData.__animations
      }
      return cloned
    }

    const loadTask = (async () => {
      try {
        const fullPath = await FileSystem.pathJoin(projectRoot, relativePath)
        const res = await FileSystem.readBuffer(fullPath)
        if (!res.success || !res.data) return null

        const blob = new Blob([res.data])
        const url = URL.createObjectURL(blob)

        const ext = relativePath.split('.').pop()?.toLowerCase()
        
        let finalScene: THREE.Object3D | null = null
        let animations: THREE.AnimationClip[] = []

        if (ext === 'fbx') {
          const loader = new FBXLoader()
          const group = await loader.loadAsync(url)
          finalScene = group
          if (group.animations && group.animations.length > 0) {
            animations = group.animations
          }
          
          // Mixamo FBX 单位修正（可选，如果模型太大就开启这行）
          // finalScene.scale.setScalar(0.01) 
        } 
        else {
          const gltf = await new Promise<any>((resolve, reject) => {
            gltfLoader.load(url, resolve, undefined, reject)
          })
          finalScene = gltf.scene || gltf.scenes[0]
          if (gltf.animations && gltf.animations.length > 0) {
            animations = gltf.animations
          }
        }

        URL.revokeObjectURL(url)

        if (finalScene) {
          // 挂载动画
          if (animations.length > 0) {
            finalScene.userData.__animations = animations
          }

          // 开启阴影
          finalScene.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true
              child.receiveShadow = true
              // 🟢 3. 防止 FBX 视锥剔除 bug (模型动了但因为包围盒没更新而消失)
              child.frustumCulled = false 
            }
          })
          
          // 存入缓存 (存原始对象)
          modelCache.set(cacheKey, finalScene)
          return finalScene
        }
        return null
      } catch (e) {
        console.error(`[AssetManager] Error loading ${relativePath}:`, e)
        return null
      } finally {
        loadingPromises.delete(cacheKey)
      }
    })()

    loadingPromises.set(cacheKey, loadTask)
    const result = await loadTask
    
    // 🟢 4. 返回时使用 SkeletonUtils 克隆
    if (result) {
      const clonedScene = SkeletonUtils.clone(result)
      
      if (result.userData.__animations) {
        clonedScene.userData.__animations = result.userData.__animations
      }
      return clonedScene
    }
    return null
  },

  dispose() {
    modelCache.clear()
    loadingPromises.clear()
  }
}