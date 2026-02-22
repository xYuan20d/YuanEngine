/**
 * PlayerController.js
 * 修复版：鼠标锁定清理 + 物理状态监控
 */
export default class PlayerController extends Behaviour {
  
  static schema = {
    sensitivity: { type: PropType.Number, default: 0.002, label: '鼠标灵敏度' },
    moveSpeed: { type: PropType.Number, default: 5.0, label: '移动速度' },
    jumpForce: { type: PropType.Number, default: 7.0, label: '跳跃力度' },
    gravity: { type: PropType.Number, default: -20.0, label: '重力加速度' },
    cameraNode: { type: PropType.Node, default: null, label: '绑定摄像机' }
  }

  onStart() {
    this.transform.rotation.order = 'YXZ';
    
    // 1. 绑定相机 (保持不变)
    if (this.inputs.cameraNode) {
      const targetId = this.inputs.cameraNode;
      this.cameraObject = this.findObjectByNodeId(this.gameObject, targetId);
      if (this.cameraObject) {
        this.cameraObject.rotation.order = 'YXZ';
        // console.log(`[Player] ✅ 相机绑定成功`);
      }
    }

    this.verticalVelocity = 0; 
    this.pitch = 0;            
    this.yaw = this.transform.rotation.y; 

    // 2. 🟢 鼠标锁定事件 (核心修复)
    this._lockHandler = (e) => {
      // [修复逻辑]：检查点击的目标是不是 Canvas
      // 如果你点击的是编辑器的按钮、输入框或空白处，e.target 就不是 CANVAS
      if (e.target.tagName !== 'CANVAS') return;

      if (!Input.isCursorLocked) {
        Input.lockCursor();
      }
    };
    
    // 使用 click 监听，并绑定到 window 以捕获 Canvas 点击
    window.addEventListener('click', this._lockHandler);

    // console.log('[Player] 初始化完成');
    this._hasWarnedMissing = false; 
  }

  onDestroy() {
    // 退出时强制解锁
    if (Input.isCursorLocked) {
      Input.unlockCursor();
    }
    
    if (this._lockHandler) {
      window.removeEventListener('click', this._lockHandler);
    }
    super.onDestroy();
  }

  findObjectByNodeId(root, targetId) {
    if (!root) return null;
    if (root.userData && root.userData.id === targetId) return root;
    for (const child of root.children) {
      const found = this.findObjectByNodeId(child, targetId);
      if (found) return found;
    }
    return null;
  }
  
  onUpdate(dt) {
    // 3. 获取物理对象
    const controller = this.getCharacterController();
    const collider = this.getCollider();

    // 如果物理还没准备好，暂停执行并打印一次警告
    if (!controller || !collider) {
      if (!this._hasWarnedMissing) {
        console.warn(`[Player] ⚠️ 物理未就绪! Controller: ${!!controller}, Collider: ${!!collider}`);
        this._hasWarnedMissing = true;
      }
      return; 
    } 
    
    // 物理就绪后，恢复日志状态（可选）
    if (this._hasWarnedMissing) {
      console.log('[Player] 🟢 物理连接成功，控制权启动');
      this._hasWarnedMissing = false;
    }

    // --- A. 鼠标视角 ---
    if (Input.isCursorLocked) {
      const sens = this.inputs.sensitivity;
      const dx = Input.getAxis('Mouse X');
      const dy = Input.getAxis('Mouse Y');

      this.yaw -= dx * sens;
      this.transform.rotation.y = this.yaw;

      if (this.cameraObject) {
        this.pitch -= dy * sens;
        this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
        this.cameraObject.rotation.x = this.pitch;
        this.cameraObject.rotation.z = 0;
      }
      this.transform.rotation.z = 0;
    }

    // --- B. 移动逻辑 ---
    let moveX = 0;
    let moveZ = 0;
    const speed = this.inputs.moveSpeed;

    if (Input.getKey('w')) moveZ -= speed * dt;
    if (Input.getKey('s')) moveZ += speed * dt;
    if (Input.getKey('a')) moveX -= speed * dt;
    if (Input.getKey('d')) moveX += speed * dt;

    const movement = new THREE.Vector3(moveX, 0, moveZ);
    movement.applyQuaternion(this.transform.quaternion);

    this.verticalVelocity += this.inputs.gravity * dt; 

    const desiredMove = {
      x: movement.x,
      y: this.verticalVelocity * dt,
      z: movement.z
    };
    
    // 计算碰撞移动
    controller.computeColliderMovement(
      collider, 
      desiredMove, 
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS 
    );
    
    const correctedMove = controller.computedMovement();

    // 应用到视觉对象
    this.transform.position.x += correctedMove.x;
    this.transform.position.y += correctedMove.y;
    this.transform.position.z += correctedMove.z;

    // 接地检测
    if (controller.computedGrounded()) {
      if (this.verticalVelocity < 0) {
        this.verticalVelocity = -0.5; // 保持贴地压力
      }
      if (Input.getKey(' ')) {
        this.verticalVelocity = this.inputs.jumpForce;
      }
    }
  }
}