// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import * as THREE from 'three'
import '@tresjs/core' 
import { Behaviour, PropType, Input, Time, Global, Wait } from './engine/Engine' // 🟢 引入 Input, Time
import Tres from '@tresjs/core'

// 1. 初始化 Input 监听器
Input._init();

// 2. 注入全局对象 (脚本环境使用)
(window as any).THREE = THREE;
(window as any).Behaviour = Behaviour;
(window as any).PropType = PropType;
(window as any).Input = Input; // 🟢 注入
(window as any).Time = Time;   // 🟢 注入
(window as any).Global = Global;
(window as any).Wait = Wait;

// 3. 全局循环处理 (更新 Time 和重置 Input)
// 注意：useLoop 只能在 setup() 或组件上下文中使用。
// 我们可以在 App.vue 里做这个，或者在这里简单 hack 一下 requestAnimationFrame
// 为了最稳健，建议把这步逻辑放在 ViewportPlayer.vue 里。
// 但为了简单，我们暂时相信 TresJS 的 loop 会在组件里跑。
// 这里我们仅做静态注入。

const app = createApp(App)
app.use(Tres)
app.mount('#app')

console.log('[Engine] Global classes injected:', { Behaviour, Input, Time })