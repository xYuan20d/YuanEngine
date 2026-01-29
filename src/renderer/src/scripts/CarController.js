/**
 * CarController.js
 * 车辆控制脚本
 */
export default class CarController extends Behaviour {
  
  static schema = {
    // --- 动力参数 ---
    engineForce: { 
      type: PropType.Number, 
      default: 2000, 
      label: '引擎动力' 
    },
    brakeForce: { 
      type: PropType.Number, 
      default: 100, 
      label: '刹车力度' 
    },
    maxSpeed: { 
      type: PropType.Number, 
      default: 50, 
      label: '最高时速' 
    },

    // --- 转向手感参数 ---
    steerAngle: { 
      type: PropType.Number, 
      default: 0.5, 
      label: '最大转向角 (弧度)' 
    },
    steerSensitivity: { 
      type: PropType.Number, 
      default: 5.0, 
      label: '转向灵敏度 (基准)' 
    },
    speedDamping: { 
      type: PropType.Number, 
      default: 0.1, 
      label: '速度阻尼系数' 
    }
  }

  onStart() {
    this.vehicleData = null;
    // 用于记录当前的实际转向角度 (用于平滑插值)
    this.currentSteerAngle = 0; 
    console.log("⏳ [Car] 等待物理车辆初始化...");
  }

  onUpdate(dt) {
    // 1. 获取数据
    if (!this.vehicleData) {
      this.vehicleData = this.getVehicle();
      if (!this.vehicleData) return;
      console.log("✅ [Car] 车辆已连接！开始控制。");
    }

    const { controller, wheels } = this.vehicleData;
    const { 
      engineForce, brakeForce, steerAngle, maxSpeed,
      steerSensitivity, speedDamping 
    } = this.inputs;

    // --- 2. 获取当前车速 (用于调整手感) ---
    // Rapier 的速度是米/秒
    const rb = this.getRigidBody();
    let currentSpeed = 0;
    if (rb) {
      const linvel = rb.linvel();
      currentSpeed = Math.sqrt(linvel.x**2 + linvel.y**2 + linvel.z**2);
    }

    // --- 3. 获取输入 ---
    let accelInput = 0;
    if (Input.getKey('w')) accelInput = 1;
    if (Input.getKey('s')) accelInput = -1;

    let targetSteerInput = 0;
    // 根据朝向可能需要反转
    if (Input.getKey('a')) targetSteerInput = 1; 
    if (Input.getKey('d')) targetSteerInput = -1;

    const isBraking = Input.getKey(' ');

    // --- 4. 🟢 核心算法：动态转向阻尼 ---
    
    // A. 计算目标角度 (玩家想要的)
    const targetAngle = targetSteerInput * steerAngle;

    // B. 计算实时灵敏度
    // 速度越快，分母越大，sensitivity 越小，转向越慢(重)
    // 例: 静止时 sensitivity = 5.0
    //     速度 20m/s 时 = 5.0 / (1 + 20 * 0.1) = 5.0 / 3 = 1.66 (变慢3倍)
    const dynamicSensitivity = steerSensitivity / (1.0 + currentSpeed * speedDamping);

    // C. 平滑插值 (Lerp)
    // 让 currentSteerAngle 慢慢接近 targetAngle
    // dt 确保了不同帧率下手感一致
    this.currentSteerAngle += (targetAngle - this.currentSteerAngle) * dynamicSensitivity * dt;

    // --- 5. 应用到轮子 ---
    for (const wheel of wheels) {
      const i = wheel.index;

      // A. 转向 (应用平滑后的值)
      if (wheel.isSteering) {
        // 1. 物理层
        controller.setWheelSteering(i, this.currentSteerAngle);
        
        // 2. 视觉层 (PhysicsItem.vue 读取此值)
        wheel.currentSteering = this.currentSteerAngle;
      }

      // B. 动力 (增加简易限速)
      if (wheel.isDrive) {
        if (isBraking) {
          controller.setWheelEngineForce(i, 0);
        } else {
          // 如果超过限速，切断动力 (简单的限速逻辑)
          if (currentSpeed > maxSpeed && Math.sign(accelInput) === Math.sign(1)) {
             controller.setWheelEngineForce(i, 0);
          } else {
             controller.setWheelEngineForce(i, accelInput * engineForce);
          }
        }
      }

      // C. 刹车
      if (isBraking) {
        controller.setWheelBrake(i, brakeForce);
      } else {
        controller.setWheelBrake(i, 0); 
      }
    }
  }
}