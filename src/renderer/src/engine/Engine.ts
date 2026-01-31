// src/engine/Engine.ts
import * as THREE from 'three'

export enum PropType { Number = 'number', String = 'string', Boolean = 'boolean', Vector3 = 'vector3', Color = 'color', Asset = 'asset', Node = 'node' }
export interface ScriptProperty { type: PropType, default: any, label?: string, min?: number, max?: number, step?: number }

export const Wait = Symbol('Wait');

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
  private static _keys = new Set<string>();
  private static _mouseButtons = new Set<number>();

  // --- 缓冲池 (Buffer) ---
  // 这里存储浏览器异步发来的、还没被游戏处理的原始数据
  private static _bufferMouseX = 0;
  private static _bufferMouseY = 0;

  // --- 快照 (Snapshot) ---
  // 这里存储当前这一帧锁定的数据，所有脚本读的都是这里
  // 在这一帧内，无论读多少次，这个值都是不变的（稳如老狗）
  private static _frameMouseX = 0;
  private static _frameMouseY = 0;

  static _init() {
    if ((window as any)._inputInited) return;
    (window as any)._inputInited = true;

    // 键盘
    window.addEventListener('keydown', (e) => this._keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this._keys.delete(e.key.toLowerCase()));

    // 鼠标按键
    window.addEventListener('mousedown', (e) => this._mouseButtons.add(e.button));
    window.addEventListener('mouseup', (e) => this._mouseButtons.delete(e.button));

    // 鼠标移动：只负责往缓冲池里加水
    window.addEventListener('mousemove', (e) => {
      this._bufferMouseX += e.movementX;
      this._bufferMouseY += e.movementY;
    });
  }

  // 帧更新 (由 PhysicsSystem 在每帧最开始调用)
  // 这就是“交换缓冲区”的操作
  static update() {
    // 1. 把缓冲池的数据“快照”下来
    this._frameMouseX = this._bufferMouseX;
    this._frameMouseY = this._bufferMouseY;

    // 2. 清空缓冲池，准备接收下一帧的输入
    this._bufferMouseX = 0;
    this._bufferMouseY = 0;
  }

  // --- 用户 API (只读快照) ---

  static getKey(key: string): boolean {
    return this._keys.has(key.toLowerCase());
  }

  static getMouseButton(button: number): boolean {
    return this._mouseButtons.has(button);
  }

  static getAxis(axis: 'Mouse X' | 'Mouse Y'): number {
    // 返回快照数据
    if (axis === 'Mouse X') return this._frameMouseX;
    if (axis === 'Mouse Y') return this._frameMouseY;
    return 0;
  }

  static lockCursor() {
    document.body.requestPointerLock();
  }

  static unlockCursor() {
    document.exitPointerLock();
  }

  static get isCursorLocked() {
    return document.pointerLockElement !== null;
  }
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
    // 1. 注销广播事件
    this._registeredEvents.forEach(({ evt, cb }) => {
      EventBus.off(evt, cb);
    });
    this._registeredEvents = [];

    // 🟢 2. 注销全局变量监听 (防止内存泄漏)
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
  
  getRigidBody() { return this.gameObject.userData.physicsBody; }

  onTriggerEnter(other: THREE.Object3D): void {}
  onTriggerExit(other: THREE.Object3D): void {}
  onCollisionEnter(other: THREE.Object3D): void {}
  onCollisionExit(other: THREE.Object3D): void {}
}