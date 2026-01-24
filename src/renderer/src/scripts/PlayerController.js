/**
 * PlayerController.js
 * 负责第一人称角色的移动、旋转、重力及跳跃
 */
export default class PlayerController extends Behaviour {
  
  // 1. 定义 Inspector 面板属性
  static schema = {
    sensitivity: { 
      type: PropType.Number, 
      default: 0.1, 
      label: '鼠标灵敏度' 
    },
    moveSpeed: { 
      type: PropType.Number, 
      default: 5.0, 
      label: '移动速度' 
    },
    jumpForce: { 
      type: PropType.Number, 
      default: 7.0, 
      label: '跳跃力度' 
    },
    gravity: { 
      type: PropType.Number, 
      default: -20.0, 
      label: '重力加速度' 
    },
    cameraName: { 
      type: PropType.String, 
      default: 'Camera', 
      label: '相机节点名称' 
    }
  }

  // 2. 初始化
  onStart() {
    // 强制设置旋转顺序，防止视角倾斜
    this.transform.rotation.order = 'YXZ';
    
    // 查找相机子对象 (用于上下抬头)
    this.cameraObject = this.gameObject.getObjectByName(this.inputs.cameraName);
    if (this.cameraObject) {
      this.cameraObject.rotation.order = 'YXZ';
    }

    // 内部状态变量
    this.verticalVelocity = 0; // 纵向速度
    this.pitch = 0;            // 相机 X 轴角度 (上下)
    this.yaw = this.transform.rotation.y; // 身体 Y 轴角度 (左右)

    console.log('[Player] 控制器已启动，点击屏幕锁定鼠标');
  }

  // 3. 每帧更新
  onUpdate(dt) {
    const controller = this.getCharacterController();
    const collider = this.getCollider();

    // 如果物理组件还没加载完，先跳过
    if (!controller || !collider) return;

    // --- A. 视角旋转逻辑 ---
    if (Input.getMouseButton(0)) {
      Input.lockCursor();
    }

    if (Input.isCursorLocked) {
      const sens = this.inputs.sensitivity;
      const dx = Input.getAxis('Mouse X');
      const dy = Input.getAxis('Mouse Y');

      // 更新左右转 (应用到身体)
      this.yaw -= dx * sens * dt;
      this.transform.rotation.y = this.yaw;

      // 更新上下看 (应用到相机)
      if (this.cameraObject) {
        this.pitch -= dy * sens * dt;
        // 限制仰角，防止翻转
        this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
        this.cameraObject.rotation.x = this.pitch;
        // 锁定 Z 轴，双重保险防止倾斜
        this.cameraObject.rotation.z = 0;
      }
      this.transform.rotation.z = 0;
    }

    // --- B. 移动输入逻辑 ---
    let moveX = 0;
    let moveZ = 0;
    const speed = this.inputs.moveSpeed;

    if (Input.getKey('w')) moveZ -= speed * dt;
    if (Input.getKey('s')) moveZ += speed * dt;
    if (Input.getKey('a')) moveX -= speed * dt;
    if (Input.getKey('d')) moveX += speed * dt;

    // 将局部移动向量转换为世界坐标方向
    const movement = new THREE.Vector3(moveX, 0, moveZ);
    movement.applyQuaternion(this.transform.quaternion);

    // --- C. 重力与跳跃逻辑 ---
    // 每一帧应用重力
    this.verticalVelocity += this.inputs.gravity * dt;

    // 组合最终的期望位移
    const desiredMove = {
      x: movement.x,
      y: this.verticalVelocity * dt,
      z: movement.z
    };

    // 🟢 让 KCC 计算实际位移 (处理碰撞、爬坡和地面)
    controller.computeColliderMovement(collider, desiredMove);
    
    // 获取计算后的安全移动向量
    const correctedMove = controller.computedMovement();

    // 应用到视觉坐标
    this.transform.position.x += correctedMove.x;
    this.transform.position.y += correctedMove.y;
    this.transform.position.z += correctedMove.z;

    // --- D. 落地检测 ---
    // 如果 KCC 告诉我们脚下有东西
    if (controller.computedGrounded()) {
      // 消除下落累积速度，防止“钻地”压力过大
      if (this.verticalVelocity < 0) {
        this.verticalVelocity = -0.5; // 保留微小的向下力，让吸附更稳
      }

      // 只有在地面上才允许跳跃
      if (Input.getKey(' ')) {
        this.verticalVelocity = this.inputs.jumpForce;
      }
    }
  }
}