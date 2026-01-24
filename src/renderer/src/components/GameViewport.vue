<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { IGameNode } from '../types/schema'

// 异步加载组件是个好习惯，尤其是区分 Editor/Player 时
import ViewportEditor from './ViewportEditor.vue'
import ViewportPlayer from './ViewportPlayer.vue'

// 重新定义 Props，保持与 App.vue 的接口一致
const props = defineProps<{
  sceneData: IGameNode[] 
  selectedId: string | null
  isPlaying: boolean
  toolMode: 'translate' | 'rotate' | 'scale'
}>()

const emit = defineEmits<{
  (e: 'select', id: string | null): void
  (e: 'update:transform', id: string, newTransform: any): void
}>()
</script>

<template>
  <div class="viewport-wrapper">
    <ViewportPlayer
      v-if="isPlaying"
      :scene-data="sceneData"
    />

    <ViewportEditor 
      v-else
      :scene-data="sceneData"
      :selected-id="selectedId"
      :tool-mode="toolMode"
      @select="(id) => emit('select', id)"
      @update:transform="(id, trans) => emit('update:transform', id, trans)"
    />
  </div>
</template>

<style scoped>
.viewport-wrapper {
  width: 100%;
  height: 100%;
}
</style>