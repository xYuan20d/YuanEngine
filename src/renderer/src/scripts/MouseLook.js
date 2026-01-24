// scripts/MouseLook.js
export default class MouseLook extends Behaviour {
  static schema = {
    sensitivity: { type: PropType.Number, default: 0.1, label: '灵敏度' }
  }

  onStart() {
    // 🟢 核心修复：强制设置旋转顺序为 YXZ
    // Y (Yaw) 首先应用，确保水平旋转不倾斜
    this.transform.rotation.order = 'YXZ';
    
    // 初始化变量记录当前的旋转角度（弧度）
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
      
      // 获取鼠标偏移
      const dx = Input.getAxis('Mouse X');
      const dy = Input.getAxis('Mouse Y');

      // 1. 累加旋转值
      this.yaw -= dx * sens * dt;   // 水平
      this.pitch -= dy * sens * dt; // 垂直

      // 2. 限制垂直旋转角度（防止翻转，-89度到89度）
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

      // 3. 应用回 transform
      this.transform.rotation.x = this.pitch;
      this.transform.rotation.y = this.yaw;
      
      // 🟢 显式确保 Z 轴永远为 0，彻底杜绝倾斜
      this.transform.rotation.z = 0;
    }
  }
}