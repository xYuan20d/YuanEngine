// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import * as THREE from 'three'
import '@tresjs/core' 
import { Behaviour, PropType, Input, Time, Global, Wait, UI, Macro, Effect } from './engine/Engine'
import Tres from '@tresjs/core'

// 🟢 1. 引入要测试的模块
import { useAnimationEditor } from './composables/useAnimationEditor'
import { SceneManager } from './engine/SceneManager'

// 初始化 Input 监听器
Input._init();

// 🟢 2. 实例化 AnimationEditor (因为它是一个 Composable，调用一次获取实例)
const animEditor = useAnimationEditor();

// 3. 注入全局对象 (调试与脚本环境使用)
const w = window as any;

// 基础引擎部分
w.THREE = THREE;
w.Behaviour = Behaviour;
w.PropType = PropType;
w.Input = Input;
w.Time = Time;
w.Global = Global;
w.Wait = Wait;
w.UI = UI;
w.Macro = Macro;
w.Effect = Effect;

// 🛠️ 调试工具注入
w.AnimEditor = animEditor;   // 👈 注入动画编辑器实例
w.SceneManager = SceneManager; // 👈 注入场景管理器 (方便找 Node ID)

console.log('[Engine] Global objects injected:', { 
  AnimEditor: w.AnimEditor, 
  SceneManager: w.SceneManager 
});

const app = createApp(App)
app.use(Tres)
app.mount('#app')