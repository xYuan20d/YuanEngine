// Rotate.js

// 注意：不需要 import Behaviour，直接用全局的
// 像写 Unity C# 脚本一样
export default class Rotate extends Behaviour {
  
  // 1. 定义 Inspector 显示的属性
  static schema = {
    speed: { 
      type: PropType.Number, 
      default: 1.0, 
      label: '旋转速度',
      step: 0.1 
    },
    axis: { 
      type: PropType.Vector3, 
      default: [0, 1, 0], // 默认绕 Y 轴
      label: '旋转轴' 
    },
    active: {
      type: PropType.Boolean,
      default: true,
      label: '是否激活'
    }
  }

  // 2. 初始化 (Start)
  onStart() {
    console.log('开始旋转:', this.gameObject.name);
  }

  // 3. 每帧更新 (Update)
  onUpdate(dt) {
    if (!this.inputs.active) return;

    const speed = this.inputs.speed; // 自动从 Inspector 获取最新值
    const axis = this.inputs.axis;   // [x, y, z]

    // 操纵物体
    this.transform.rotation.x += axis[0] * speed * dt;
    this.transform.rotation.y += axis[1] * speed * dt;
    this.transform.rotation.z += axis[2] * speed * dt;
  }
}