// src/engine/Engine.ts
import * as THREE from 'three'
import { useUIStore } from '../composables/useUIStore'
import { SceneManager } from './SceneManager'
import { FileSystem } from './FileSystem'
import { Cloner } from './Cloner'
import { ref } from 'vue'

export enum PropType { Number = 'number', String = 'string', Boolean = 'boolean', Vector3 = 'vector3', Color = 'color', Asset = 'asset', Node = 'node' }
export interface ScriptProperty { type: PropType, default: any, label?: string, min?: number, max?: number, step?: number }
export const RuntimeRegistry = new Map<string, THREE.Object3D>();

export const Wait = Symbol('Wait');  // 挂起标识

export class ProjectConfig {
  /**
   * 记录当前项目的根目录。
   * 它在编辑器生命周期内是持久的，不受游戏 Play/Stop 影响。
   */
  public static rootPath: string | null = null;
}

export class UI {
  /**
   * 更新 UI 数据 (给 Vue 组件传参)
   */
  static update(nodeId: string, data: Record<string, any>) {
    const { updateData } = useUIStore()
    updateData(nodeId, data)
  }

  /**
   * 🟢 显/隐控制 (系统级开关)
   * 直接控制引擎层的渲染开关，无需在 Vue 组件里写 v-show
   */
  static setVisible(nodeId: string, visible: boolean) {
     const { setVisible } = useUIStore()
     setVisible(nodeId, visible) 
  }
}

export class ScriptManager {
  private static _pendingScripts = new Set<any>();
  private static _isRetrying = false;

  // 🟢 1. 让 tryStart 返回布尔值：成功=true, 挂起=false
  static tryStart(instance: any): boolean {
    if (!instance.onStart) return true; // 没 onStart 视为成功

    try {
      // 如果之前已经启动成功过，就别再折腾了（防止重复调用）
      if (instance._hasStarted) return true;

      const result = instance.onStart();

      if (result === Wait) {
        // 挂起
        if (!this._pendingScripts.has(instance)) {
          console.log(`[ScriptManager] ⏳ 挂起: ${instance.gameObject.name}`);
          this._pendingScripts.add(instance);
        }
        return false; // ❌ 失败
      } else {
        // 成功
        instance._hasStarted = true; // 标记已启动
        this._pendingScripts.delete(instance);
        
        // ⚠️ 注意：这里不再直接调用 _retryPending()，而是只返回状态
        // 由 _retryPending 内部决定是否继续循环
        return true; // ✅ 成功
      }
    } catch (e) {
      console.error(`[Script Error] ${instance.gameObject.name}:`, e);
      return true; // 报错了也算“结束”，别卡死队列
    }
  }

  // 🟢 2. 智能遍历：只要有进展，就继续下一轮
  static checkPending() {
    if (this._isRetrying) return;
    this._isRetrying = true;

    let hasProgress = true;

    // 🔄 核心逻辑：死循环检测，直到稳定
    // 只要上一轮有人成功复活 (hasProgress === true)，就说明环境变了，
    // 可能那些原本失败的人（像 A）现在能成功了，所以要再跑一轮。
    while (hasProgress && this._pendingScripts.size > 0) {
      hasProgress = false;
      
      // 快照当前队列
      const currentQueue = Array.from(this._pendingScripts);

      for (const instance of currentQueue) {
        // 再次尝试启动
        const success = this.tryStart(instance);
        
        // 如果有人成功了，标记进度为 true，迫使 while 再跑一轮
        if (success) {
          hasProgress = true;
        }
      }
    }

    this._isRetrying = false;
  }
}

// 双重缓冲
export class Input {
  // 1. 持续状态 (Hold)
  private static _keys = new Set<string>();      // 当前按住的键
  private static _mouseButtons = new Set<number>(); // 当前按住的鼠标键

  // 2. 瞬时状态缓冲 (Buffer - 接收浏览器异步事件)
  private static _downBuffer = new Set<string>(); // 这一帧按下的键
  private static _upBuffer = new Set<string>();   // 这一帧松开的键
  
  private static _mouseDownBuffer = new Set<number>();
  private static _mouseUpBuffer = new Set<number>();

  // 3. 帧快照 (Frame Snapshot - 供脚本读取的稳定数据)
  private static _frameDown = new Set<string>();
  private static _frameUp = new Set<string>();
  
  private static _frameMouseDown = new Set<number>();
  private static _frameMouseUp = new Set<number>();

  // 鼠标移动缓冲
  private static _bufferMouseX = 0;
  private static _bufferMouseY = 0;
  private static _frameMouseX = 0;
  private static _frameMouseY = 0;

  static _init() {
    if ((window as any)._inputInited) return;
    (window as any)._inputInited = true;

    // --- 键盘事件 ---
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      // 关键：防止长按时操作系统自动触发重复的 keydown
      if (!this._keys.has(k)) {
        this._downBuffer.add(k);
      }
      this._keys.add(k);
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this._keys.delete(k);
      this._upBuffer.add(k);
    });

    // --- 鼠标按键事件 ---
    window.addEventListener('mousedown', (e) => {
      if (!this._mouseButtons.has(e.button)) {
        this._mouseDownBuffer.add(e.button);
      }
      this._mouseButtons.add(e.button);
    });

    window.addEventListener('mouseup', (e) => {
      this._mouseButtons.delete(e.button);
      this._mouseUpBuffer.add(e.button);
    });

    // --- 鼠标移动 ---
    window.addEventListener('mousemove', (e) => {
      this._bufferMouseX += e.movementX;
      this._bufferMouseY += e.movementY;
    });
  }

  // 帧更新 (由 PhysicsSystem 调用)
  static update() {
    // 1. 处理鼠标移动 (现有逻辑)
    this._frameMouseX = this._bufferMouseX;
    this._frameMouseY = this._bufferMouseY;
    this._bufferMouseX = 0;
    this._bufferMouseY = 0;

    // 2. 处理瞬时按键 (新增逻辑)
    // 将缓冲区的事件“快照”到当前帧，并清空缓冲区
    
    // 键盘
    this._frameDown = new Set(this._downBuffer);
    this._downBuffer.clear();
    
    this._frameUp = new Set(this._upBuffer);
    this._upBuffer.clear();

    // 鼠标
    this._frameMouseDown = new Set(this._mouseDownBuffer);
    this._mouseDownBuffer.clear();
    
    this._frameMouseUp = new Set(this._mouseUpBuffer);
    this._mouseUpBuffer.clear();
  }

  // --- 用户 API ---

  // 1. 持续按住 (移动用)
  static getKey(key: string): boolean {
    return this._keys.has(key.toLowerCase());
  }

  // 2. 🟢 按下瞬间 (切换开关、跳跃、开火用) -> 只有一帧为 true
  static getKeyDown(key: string): boolean {
    return this._frameDown.has(key.toLowerCase());
  }

  // 3. 🟢 松开瞬间
  static getKeyUp(key: string): boolean {
    return this._frameUp.has(key.toLowerCase());
  }

  // 鼠标 API
  static getMouseButton(button: number): boolean { return this._mouseButtons.has(button); }
  static getMouseButtonDown(button: number): boolean { return this._frameMouseDown.has(button); } // 新增
  static getMouseButtonUp(button: number): boolean { return this._frameMouseUp.has(button); }     // 新增

  static getAxis(axis: 'Mouse X' | 'Mouse Y'): number {
    if (axis === 'Mouse X') return this._frameMouseX;
    if (axis === 'Mouse Y') return this._frameMouseY;
    return 0;
  }

  static lockCursor() { document.body.requestPointerLock(); }
  static unlockCursor() { document.exitPointerLock(); }
  static get isCursorLocked() { return document.pointerLockElement !== null; }
}

// Time 类
export class Time {
  public static deltaTime = 0;
  public static time = 0;
}

// 初始化
Input._init();

export class Global {
  private static _data: Record<string, any> = {};
  private static _watchers = new Map<string, Set<(val: any) => void>>();

  // 🟢 1. 修改 set: 它现在也是“有声”的了
  // 它的语义变成了：强制设置（初始化/重置），并通知所有关心的人
  static set(key: string, value: any) {
    this._data[key] = value;
    this._notify(key, value);
  }

  // 🟢 2. update: 语义为“更新逻辑”
  // 目前代码和 set 一样，但未来你可以在这里加 diff 检测 (if oldVal === newVal return)
  static update(key: string, value: any) {
    this._data[key] = value;
    this._notify(key, value);
  }

  // 内部通知函数 (DRY原则)
  private static _notify(key: string, value: any) {
    if (this._watchers.has(key)) {
      this._watchers.get(key)!.forEach(cb => {
        try {
          cb(value);
        } catch (e) {
          console.error(`[Global Watch Error] Key: ${key}`, e);
        }
      });
    }
  }

  static get<T = any>(key: string, defaultValue?: T): T {
    return key in this._data ? this._data[key] : defaultValue;
  }

  static has(key: string): boolean {
    return key in this._data;
  }

  static clear() {
    this._data = {};
    this._watchers.clear();
  }

  static _addWatcher(key: string, callback: (val: any) => void) {
    if (!this._watchers.has(key)) {
      this._watchers.set(key, new Set());
    }
    this._watchers.get(key)!.add(callback);
  }

  static _removeWatcher(key: string, callback: (val: any) => void) {
    if (this._watchers.has(key)) {
      this._watchers.get(key)!.delete(callback);
    }
  }
}

// 🟢 2. 新增：内部事件总线 (底座)
class EventBus {
  private static _listeners = new Map<string, Set<(data: any) => void>>();

  static on(event: string, callback: (data: any) => void) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(callback);
  }

  static off(event: string, callback: (data: any) => void) {
    if (this._listeners.has(event)) {
      this._listeners.get(event)!.delete(callback);
    }
  }

  static emit(event: string, data?: any) {
    if (this._listeners.has(event)) {
      // 复制一份执行，防止执行过程中有人 unsubscribe 导致 Set 遍历报错
      this._listeners.get(event)!.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[Broadcast Error] Event: ${event}`, e);
        }
      });
    }
  }
}

export class Macro {
  static async instantiate(
    macroPath: string, 
    parentId: string | null = null, 
    position?: THREE.Vector3 | {x:number, y:number, z:number}, 
    rotation?: THREE.Euler | {x:number, y:number, z:number}
  ): Promise<THREE.Object3D | null> {
    
    // ⬇️ 改用专用的 ProjectConfig 获取路径
    if (!ProjectConfig.rootPath) {
      console.error('[Macro] 无法实例化：项目根目录未配置 (ProjectConfig.rootPath is null)。');
      return null;
    }

    const fullPath = await FileSystem.pathJoin(ProjectConfig.rootPath, macroPath);
    const res = await FileSystem.readFile(fullPath);

    if (!res.success || !res.data) {
      console.error('[Macro] 宏读取失败:', res.error);
      return null;
    }

    try {
      const rawData = JSON.parse(res.data);
      const nodesToInstantiate = Array.isArray(rawData) ? rawData : [rawData];
      const newNodes: any[] = [];

      // 拿到当前上下文的节点树 (直接修改 Vue 的响应式数据)
      const sceneNodes = SceneManager.currentNodes.value; 

      const findNodeRecursive = (nodes: any[], id: string): any => {
        for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
            const found = findNodeRecursive(node.children, id);
            if (found) return found;
          }
        }
      };

      // 克隆并注入
      for (const rawNode of nodesToInstantiate) {
        const instance = Cloner.instantiate(rawNode);
        instance.macro = { source: macroPath };

        if (position) instance.position = [position.x, position.y, position.z];
        if (rotation) {
          const rx = (rotation as any)._x ?? rotation.x;
          const ry = (rotation as any)._y ?? rotation.y;
          const rz = (rotation as any)._z ?? rotation.z;
          instance.rotation = [rx, ry, rz];
        }

        if (parentId) {
          const parent = findNodeRecursive(sceneNodes, parentId);
          if (parent) {
            if (!parent.children) parent.children = [];
            parent.children.push(instance);
          } else {
            sceneNodes.push(instance); 
          }
        } else {
          sceneNodes.push(instance);
        }
        
        newNodes.push(instance);
      }

      if (newNodes.length === 0) return null;

      // ⏳ 等待 Vue 将数据转化为 Three.js 实体
      const firstId = newNodes[0].id;
      for (let i = 0; i < 50; i++) { 
        const obj = RuntimeRegistry.get(firstId);
        if (obj) return obj; 
        await new Promise(r => setTimeout(r, 20)); 
      }

      console.warn(`[Macro] 实例已压入数据树，但等待 Three.js 挂载超时: ${firstId}`);
      return null;

    } catch (e) {
      console.error('[Macro] 实例化解析错误:', e);
      return null;
    }
  }

  static destroy(id: string): boolean {
    const sceneNodes = SceneManager.currentNodes.value;
    
    const deleteNodeRecursive = (nodes: any[], targetId: string): boolean => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === targetId) {
          nodes.splice(i, 1); // 触发 Vue 响应式卸载
          return true;
        }
        if (nodes[i].children) {
          const deleted = deleteNodeRecursive(nodes[i].children, targetId);
          if (deleted) return true;
        }
      }
      return false;
    };
    
    return deleteNodeRecursive(sceneNodes, id);
  }
}

// 🟢 1. 定义 Outline 的配置参数
export interface OutlineConfig {
  color?: string;
  edgeStrength?: number;
  pulseSpeed?: number;
  blur?: boolean;
}

// 🟢 2. 内部状态分组 (按配置参数的 JSON Hash 分组)
interface OutlineGroup {
  id: string; 
  config: OutlineConfig;
  nodeIds: Set<string>;
}

// 这个响应式变量专门供 Vue 渲染器读取
export const activeOutlines = ref<OutlineGroup[]>([]);

// 🟢 3. 暴露给脚本的 Effect 类
export class Effect {
  static Outline = {
    /**
     * 为指定物体添加描边特效
     * @param nodeId 物体的 NodeID
     * @param params 描边参数 (color, edgeStrength 等)
     */
    add(nodeId: string, params: OutlineConfig = {}) {
      // 用配置参数的字符串作为唯一 Key，相同的颜色和粗细会自动合并到一个 Pass 里，节省性能
      const configHash = JSON.stringify(params); 
      
      let group = activeOutlines.value.find(g => g.id === configHash);

      if (!group) {
        group = { id: configHash, config: params, nodeIds: new Set() };
        activeOutlines.value.push(group);
      }

      group.nodeIds.add(nodeId);
      
      // 触发 Vue 的深度响应式更新
      activeOutlines.value = [...activeOutlines.value]; 
    },

    /**
     * 移除指定物体的描边
     */
    remove(nodeId: string) {
      let updated = false;
      
      activeOutlines.value.forEach(group => {
        if (group.nodeIds.has(nodeId)) {
          group.nodeIds.delete(nodeId);
          updated = true;
        }
      });

      // 清理掉空的通道组
      if (updated) {
        activeOutlines.value = activeOutlines.value.filter(g => g.nodeIds.size > 0);
      }
    },

    /**
     * 清除所有描边 (通常在切换场景或退出 Play 模式时调用)
     */
    clear() {
      activeOutlines.value = [];
    }
  }
}

// 基类
export class Behaviour {
  public gameObject: THREE.Object3D;
  public transform: THREE.Object3D;
  public inputs: Record<string, any> = {};
  public _componentData: any;

  // 记录注册的事件，用于销毁
  private _registeredEvents: Array<{ evt: string, cb: any }> = [];
  // 🟢 记录注册的全局变量监听，用于销毁
  private _registeredWatches: Array<{ key: string, cb: any }> = [];

  constructor(gameObject: THREE.Object3D, componentData: any) {
    this.gameObject = gameObject;
    this.transform = gameObject;
    this._componentData = componentData || {};
  }

  get enabled(): boolean { return this._componentData.active !== false; }
  set enabled(value: boolean) { this._componentData.active = value; }

  getCharacterController() { return this.gameObject.userData.characterController; }

  getCollider() {
    const body = this.getRigidBody();
    if (body && body.numColliders() > 0) return body.collider(0); 
    return null;
  }

  getVehicle() { return this.gameObject.userData.vehicle; }

  onStart(): void {}
  onUpdate(dt: number, time: number): void {}

  onDestroy(): void {
    // 注销广播事件
    this._registeredEvents.forEach(({ evt, cb }) => {
      EventBus.off(evt, cb);
    });
    this._registeredEvents = [];

    // 注销全局变量监听
    this._registeredWatches.forEach(({ key, cb }) => {
      Global._removeWatcher(key, cb);
    });
    this._registeredWatches = [];
  }

  broadcast(event: string, data?: any) {
    EventBus.emit(event, data);
  }

  on(event: string, callback: (data: any) => void) {
    const safeCallback = callback.bind(this);
    EventBus.on(event, safeCallback);
    this._registeredEvents.push({ evt: event, cb: safeCallback });
  }

  // 🟢 新增 API: 监听全局变量变化
  // 相当于 Vue 的 watch(ref, (newVal) => { ... })
  watch(key: string, callback: (value: any) => void, immediate: boolean = true) {
    const safeCallback = callback.bind(this);
    
    // A. 注册监听 (不管变量存不存在，先占个座)
    // 这样如果变量还没创建 (set 还没调)，等会儿 set 调用时，我就能收到了
    Global._addWatcher(key, safeCallback);
    this._registeredWatches.push({ key: key, cb: safeCallback });

    // B. 立即执行 (Optional)
    // 如果监听的时候，这个变量已经被别人 set 过了，那我现在就要拿到最新值，别傻等
    if (immediate && Global.has(key)) {
      try {
        safeCallback(Global.get(key));
      } catch (e) {
        console.error(`[Watch Immediate Error] ${key}`, e);
      }
    }
  }

  getAnimator() {
    let animator: any = null;

    // 1. 先检查自己 (gameObject) 是否直接挂载了 animator
    if (this.gameObject.userData && this.gameObject.userData.animator) {
      return this.gameObject.userData.animator;
    }

    // 2. 如果自己没有，就去子节点里找 (因为 SkinnedModel 是作为子节点挂载的)
    this.gameObject.traverse((child) => {
      if (animator) return; // 找到了就停
      if (child.userData && child.userData.animator) {
        animator = child.userData.animator;
      }
    });

    return animator;
  }
  
  getRigidBody() { return this.gameObject.userData.physicsBody; }

  /**
   * 动态修改父级 (Runtime)
   * @param targetId 目标父节点 ID (传 null 回到场景根节点)
   * @param keepWorldTransform 是否保持世界坐标不变 (true = 视觉上站在原地不动，false = 保持局部坐标，世界位置会突变)
   * @param resetLocalPosition 是否强制归零局部坐标 (上车对齐时使用，通常此时 keepWorldTransform 为 false)
   */
  setParent(targetId: string | null, keepWorldTransform: boolean = true, resetLocalPosition: boolean = false): boolean {
    
    let targetParent: THREE.Object3D | null = null;
    
    if (targetId === null) {
      targetParent = this.gameObject;
      while (targetParent.parent) {
        targetParent = targetParent.parent;
      }
    } else {
      targetParent = RuntimeRegistry.get(targetId) || null;
    }

    if (!targetParent) {
      console.error(`[setParent] ❌ 找不到目标节点: ${targetId}`);
      return false;
    }

    if (keepWorldTransform) {
      targetParent.attach(this.gameObject);
    } else {
      targetParent.add(this.gameObject);
    }

    if (resetLocalPosition) {
      this.gameObject.position.set(0, 0, 0);
      this.gameObject.rotation.set(0, 0, 0);
    }

    // 回写给vue的底层数据
    if (this.gameObject.userData._node) {
      const node = this.gameObject.userData._node;
      node.position = [this.gameObject.position.x, this.gameObject.position.y, this.gameObject.position.z];
      node.rotation = [this.gameObject.rotation.x, this.gameObject.rotation.y, this.gameObject.rotation.z];
      node.scale = [this.gameObject.scale.x, this.gameObject.scale.y, this.gameObject.scale.z];
    }

    const rb = this.getRigidBody();
    if (rb) {
      
    }

    return true;
  }
  
  // 🟢 3. 顺手加一个：查找物体 API
  findObject(id: string): THREE.Object3D | undefined {
    return RuntimeRegistry.get(id);
  }
  get active(): boolean {
    // 优先读取 Vue 绑定的响应式数据
    if (this.gameObject.userData && this.gameObject.userData._node) {
      return this.gameObject.userData._node.active;
    }
    return this.gameObject.visible; // 降级处理
  }

  set active(value: boolean) {
    // 修改 Vue 的响应式数据 -> 触发 v-if -> 销毁/创建组件
    if (this.gameObject.userData && this.gameObject.userData._node) {
      this.gameObject.userData._node.active = value;
    } else {
      this.gameObject.visible = value;
    }
  }

  get visible(): boolean {
    if (this.gameObject.userData && this.gameObject.userData._node) {
      // 优先读 Vue 数据，保证响应式
      return this.gameObject.userData._node.visible !== false;
    }
    return this.gameObject.visible;
  }

  set visible(value: boolean) {
    // 同步修改 Vue 数据 -> 触发 TresJS 更新 -> 界面更新
    if (this.gameObject.userData && this.gameObject.userData._node) {
      this.gameObject.userData._node.visible = value;
    } else {
      this.gameObject.visible = value;
    }
  }

  onTriggerEnter(other: THREE.Object3D): void {}
  onTriggerExit(other: THREE.Object3D): void {}
  onCollisionEnter(other: THREE.Object3D): void {}
  onCollisionExit(other: THREE.Object3D): void {}
}