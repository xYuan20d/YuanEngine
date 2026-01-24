// src/engine/Engine.ts
import * as THREE from 'three'

// 保持原有的枚举和接口不变...
export enum PropType { Number = 'number', String = 'string', Boolean = 'boolean', Vector3 = 'vector3', Color = 'color', Asset = 'asset' }
export interface ScriptProperty { type: PropType, default: any, label?: string, min?: number, max?: number, step?: number }

// 🟢 1. 纯 JS 实现的 Input 类
export class Input {
  // 记录按键状态
  private static _keys = new Set<string>();
  private static _mouseButtons = new Set<number>();
  
  // 记录鼠标这一帧的偏移量
  public static mouseDeltaX = 0;
  public static mouseDeltaY = 0;

  // 初始化监听器 (只运行一次)
  static _init() {
    if ((window as any)._inputInited) return;
    (window as any)._inputInited = true;

    // 键盘
    window.addEventListener('keydown', (e) => this._keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this._keys.delete(e.key.toLowerCase()));

    // 鼠标按键
    window.addEventListener('mousedown', (e) => {
      this._mouseButtons.add(e.button);
      // 如果点击了画布，且脚本请求锁定，这里是最好的触发时机
    });
    window.addEventListener('mouseup', (e) => this._mouseButtons.delete(e.button));

    // 🟢 鼠标移动 (核心)
    // movementX 是浏览器原生提供的“上一帧到现在的偏移量”
    window.addEventListener('mousemove', (e) => {
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });
  }

  // --- 用户 API ---

  static getKey(key: string): boolean {
    return this._keys.has(key.toLowerCase());
  }

  static getMouseButton(button: number): boolean {
    return this._mouseButtons.has(button);
  }

  // 获取轴 (仿 Unity)
  static getAxis(axis: 'Mouse X' | 'Mouse Y'): number {
    if (axis === 'Mouse X') return this.mouseDeltaX;
    if (axis === 'Mouse Y') return this.mouseDeltaY;
    return 0;
  }

  // 锁定鼠标
  static lockCursor() {
    document.body.requestPointerLock();
  }

  // 解锁鼠标
  static unlockCursor() {
    document.exitPointerLock();
  }

  static get isCursorLocked() {
    return document.pointerLockElement !== null;
  }

  // 帧末重置 (由 PhysicsSystem 调用)
  static _resetFrame() {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }
}

// 🟢 2. Time 类
export class Time {
  public static deltaTime = 0;
  public static time = 0;
}

// 🟢 3. 初始化
Input._init();

// Behaviour 基类 (保持不变，略去以节省篇幅，记得包含 getRigidBody 等新加的方法)
export class Behaviour {
  public gameObject: THREE.Object3D;
  public transform: THREE.Object3D;
  public inputs: Record<string, any> = {};
  public _componentData: any;

  constructor(gameObject: THREE.Object3D, componentData: any) {
    this.gameObject = gameObject;
    this.transform = gameObject;
    this._componentData = componentData || {};
  }

  get enabled(): boolean { return this._componentData.active !== false; }
  set enabled(value: boolean) { this._componentData.active = value; }

  getCharacterController() {
    return this.gameObject.userData.characterController;
  }

  // 🟢 获取碰撞体 (KCC 计算需要用到碰撞体引用)
  getCollider() {
    const body = this.getRigidBody();
    if (body && body.numColliders() > 0) {
      // 获取该刚体的第一个碰撞体
      return body.collider(0); 
    }
    return null;
  }

  onStart(): void {}
  onUpdate(dt: number, time: number): void {}
  onDestroy(): void {}
  
  getRigidBody() { return this.gameObject.userData.physicsBody; }
}