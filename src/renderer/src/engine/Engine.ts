// src/engine/Engine.ts
import * as THREE from 'three'

export enum PropType { Number = 'number', String = 'string', Boolean = 'boolean', Vector3 = 'vector3', Color = 'color', Asset = 'asset', Node = 'node' }
export interface ScriptProperty { type: PropType, default: any, label?: string, min?: number, max?: number, step?: number }

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

// 基类
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

  getCollider() {
    const body = this.getRigidBody();
    if (body && body.numColliders() > 0) {
      return body.collider(0); 
    }
    return null;
  }

  getVehicle() {
    return this.gameObject.userData.vehicle;
  }

  onStart(): void {}
  onUpdate(dt: number, time: number): void {}
  onDestroy(): void {}
  
  getRigidBody() { return this.gameObject.userData.physicsBody; }

  onTriggerEnter(other: THREE.Object3D): void {}
  onTriggerExit(other: THREE.Object3D): void {}
  onCollisionEnter(other: THREE.Object3D): void {}
  onCollisionExit(other: THREE.Object3D): void {}
}