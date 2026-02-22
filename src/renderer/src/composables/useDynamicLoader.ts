import { shallowRef, watch, inject } from 'vue'
import * as Vue from 'vue'
import { loadModule } from 'vue3-sfc-loader'
import { FileSystem } from '../engine/FileSystem'

export function useDynamicLoader(srcRef: any, nodeId: string) {
  const componentRef = shallowRef<any>(null)
  const projectRoot = inject('project-root') as any
  
  // 获取数据注入源
  const registry = inject<any>('scene-registry')
  // 即使在 World 模式下，我们也尝试获取一下 node 数据，保持接口一致
  const currentNode = registry?.get ? registry.get(nodeId) : null

  const options = {
    moduleCache: { vue: Vue },
    async getFile(url: string) {
      if (!projectRoot?.value) return ''
      const fullPath = await FileSystem.pathJoin(projectRoot.value, url)
      const res = await FileSystem.readFile(fullPath)
      return res.data || ''
    },
    addStyle(textContent: string) {
      const style = document.createElement('style')
      style.textContent = textContent
      document.head.appendChild(style)
    },
  }

  watch(srcRef, async (path: string) => {
    if (!path || !projectRoot?.value) {
      componentRef.value = null
      return
    }
    try {
      componentRef.value = await loadModule(path, options)
    } catch (e) {
      console.error(`[Loader] Failed: ${path}`, e)
    }
  }, { immediate: true })

  return { componentRef, currentNode }
}