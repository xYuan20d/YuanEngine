/**
 * PlayerController.js
 * 负责第一人称角色的移动、旋转、重力及跳跃 (调试版)
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
    
    // 🟢 修改 2: 运行时通过 ID 查找对象
    if (this.inputs.cameraNode) {
      const targetId = this.inputs.cameraNode;
      
      console.group(`[Player] 📷 开始绑定相机`);
      console.log(`> 目标 Node ID: "${targetId}"`);
      console.log(`> 搜索范围 (Root):`, this.gameObject);

      // 在当前玩家对象的子节点里查找对应的物体
      this.cameraObject = this.findObjectByNodeId(this.gameObject, targetId);
      
      // ✅ 调试日志：打印获取到的对象
      if (this.cameraObject) {
        console.log(`> ✅ 成功找到对象:`, this.cameraObject);
        console.log(`> 对象名称: "${this.cameraObject.name}"`);
        console.log(`> 对象 UserData:`, this.cameraObject.userData);
        
        this.cameraObject.rotation.order = 'YXZ';
      } else {
        console.error(`> ❌ 未找到对象!`);
        console.log(`> 请检查: 1. 该节点是否是 Player 的子节点?`);
        console.log(`> 请检查: 2. 该节点是否有 .userData.id = "${targetId}"?`);
      }
      console.groupEnd();

    } else {
      console.log('[Player] ⚠️ 未绑定相机！请在右侧面板拖入相机节点');
    }

    this.verticalVelocity = 0; 
    this.pitch = 0;            
    this.yaw = this.transform.rotation.y; 

    console.log('[Player] 控制器已启动，点击屏幕锁定鼠标');
  }

  // 递归查找 ID
  findObjectByNodeId(root, targetId) {
    if (!root) return null;
    
    // 打印遍历过程 (如果找不到，可以取消注释这行看它遍历了谁)
    // console.log(`Checking: ${root.name} [${root.userData?.id}]`);

    if (root.userData && root.userData.id === targetId) return root;
    
    for (const child of root.children) {
      const found = this.findObjectByNodeId(child, targetId);
      if (found) return found;
    }
    return null;
  }
  
  onUpdate(dt) {
    // ... (保持不变)
    const controller = this.getCharacterController();
    const collider = this.getCollider();

    if (!controller || !collider) return;

    if (Input.getMouseButton(0)) {
      Input.lockCursor();
    }

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
    
    controller.computeColliderMovement(
      collider, 
      desiredMove, 
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS // <--- 直接把这个数字传进去
    );
    const correctedMove = controller.computedMovement();

    this.transform.position.x += correctedMove.x;
    this.transform.position.y += correctedMove.y;
    this.transform.position.z += correctedMove.z;

    if (controller.computedGrounded()) {
      if (this.verticalVelocity < 0) {
        this.verticalVelocity = -0.5; 
      }

      if (Input.getKey(' ')) {
        this.verticalVelocity = this.inputs.jumpForce;
      }
    }
  }
}