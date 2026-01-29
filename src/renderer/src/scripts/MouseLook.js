// scripts/MouseLook.js
export default class MouseLook extends Behaviour {
  static schema = {
    // 🟢 修改 1: 默认灵敏度要调小 (建议 0.002 左右)
    // 之前的 0.1 配合 dt 是合适的，现在去掉了 dt，0.1 会快得像陀螺
    sensitivity: { type: PropType.Number, default: 0.002, label: '灵敏度' }
  }

  onStart() {
    this.transform.rotation.order = 'YXZ';
    this.pitch = this.transform.rotation.x;
    this.yaw = this.transform.rotation.y;
    console.log('点击画面以锁定鼠标');
  }

  onUpdate(dt) {
    if (Input.getMouseButton(0)) {
      Input.lockCursor();
    }

    if (Input.isCursorLocked) {
      const sens = this.inputs.sensitivity;
      
      // 获取鼠标这一帧的物理移动像素 (Buffer Snapshot)
      const dx = Input.getAxis('Mouse X');
      const dy = Input.getAxis('Mouse Y');

      // 🟢 修改 2: 绝对不要乘 dt !
      // 逻辑：移动多少像素 * 每个像素代表多少弧度
      this.yaw -= dx * sens;   
      this.pitch -= dy * sens; 

      // 限制垂直旋转角度
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

      // 应用
      this.transform.rotation.x = this.pitch;
      this.transform.rotation.y = this.yaw;
      this.transform.rotation.z = 0;
    }
  }
}