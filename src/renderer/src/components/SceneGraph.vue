<script setup lang="ts">
import { IGameNode } from '../types/schema'
import GameEntity from './GameEntity.vue'

defineProps<{
  nodes: IGameNode[]
}>()

// 定义事件，允许父组件（主要是 Editor）监听点击
// Player 模式下通常不需要这个 click，但预留接口没坏处
const emit = defineEmits<{
  (e: 'node-click', event: any): void
}>()
</script>

<template>
  <GameEntity 
    v-for="node in nodes"
    :key="node.id"
    :node="node" 
    @click="(e) => emit('node-click', e)" 
  />
</template>