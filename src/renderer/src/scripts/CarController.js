/**
 * CarController.js
 * 车辆控制脚本 (最终完整版)
 * 集成视觉欺骗算法，解决物理引擎车轴同步问题
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
    this.currentSteerAngle = 0;
    
    // 初始化轮子累计旋转角度数组
    this.wheelRotations = []; 
    
    console.log("⏳ [Car] 等待物理车辆初始化...");
  }

  onUpdate(dt) {
    // 1. 获取车辆数据 (懒加载)
    if (!this.vehicleData) {
      this.vehicleData = this.getVehicle();
      if (!this.vehicleData) return;
      
      console.log("✅ [Car] 车辆已连接！开始控制。");

      console.log(engineForce, brakeForce, steerAngle, maxSpeed,
      steerSensitivity, speedDamping )
      
      // 根据轮子数量初始化角度数组
      const { wheels } = this.vehicleData;
      this.wheelRotations = wheels.map(() => 0); 
    }

    const { controller, wheels } = this.vehicleData;
    const { 
      engineForce, brakeForce, steerAngle, maxSpeed,
      steerSensitivity, speedDamping 
    } = this.inputs;

    // --- 2. 计算真实的切向速度 (Visual Illusion 核心) ---
    // 这一步是为了让轮子转动匹配真实车速，而不是依赖可能出错的物理车轴
    const rb = this.getRigidBody();
    let forwardSpeed = 0;
    
    if (rb) {
      const vel = rb.linvel(); // 获取世界坐标系速度
      const velVec = new THREE.Vector3(vel.x, vel.y, vel.z);
      
      // 获取车身的正前方方向 (假设 Z 轴为前方)
      // 如果你的车倒着走，把这里的 (0, 0, 1) 改成 (0, 0, -1) 即可
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.gameObject.quaternion);
      
      // 点乘：计算速度在前进方向上的投影
      // 结果：正数=前进，负数=后退，0=纯侧滑 (此时轮子不转，完美符合物理!)
      forwardSpeed = velVec.dot(forward);
    }
    
    const currentSpeedAbs = Math.abs(forwardSpeed);

    // --- 3. 获取键盘输入 ---
    let accelInput = 0;
    if (Input.getKey('w')) accelInput = 1;
    if (Input.getKey('s')) accelInput = -1;

    let targetSteerInput = 0;
    // 根据朝向可能需要反转按键，如果反了交换这里
    if (Input.getKey('a')) targetSteerInput = 1; 
    if (Input.getKey('d')) targetSteerInput = -1;

    const isBraking = Input.getKey(' ');

    // --- 4. 动态转向阻尼 (手感优化) ---
    // 速度越快，转向越沉，防止高速翻车
    const targetAngle = targetSteerInput * steerAngle;
    const dynamicSensitivity = steerSensitivity / (1.0 + currentSpeedAbs * speedDamping);
    
    // 平滑插值
    this.currentSteerAngle += (targetAngle - this.currentSteerAngle) * dynamicSensitivity * dt;

    // --- 5. 应用控制 & 视觉同步 ---
    for (const wheel of wheels) {
      const i = wheel.index;

      // A. [视觉] 手动计算轮子滚动 (解决物理引擎后轮不转的问题)
      // 公式: 角度增量 = (切向速度 * 时间) / 半径
      if (wheel.radius > 0) {
        // forwardSpeed 自带正负号，所以倒车时轮子会自动反转
        const angleDelta = (forwardSpeed * dt) / wheel.radius;
        
        // 累加角度 (存到脚本自己的数组里，防止每帧重置)
        if (this.wheelRotations[i] === undefined) this.wheelRotations[i] = 0;
        this.wheelRotations[i] += angleDelta;
        
        // 🟢 将计算结果写入 wheel 数据
        // PhysicsItem.vue 会优先读取这个值来设置模型旋转
        wheel.currentRotation = this.wheelRotations[i];
      }

      // B. [物理+视觉] 转向控制
      if (wheel.isSteering) {
        // 物理层: 告诉引擎车轮转角
        controller.setWheelSteering(i, this.currentSteerAngle);
        // 视觉层: 写入数据供渲染器平滑显示
        wheel.currentSteering = this.currentSteerAngle;
      }

      // C. [物理] 动力应用
      if (wheel.isDrive) {
        if (isBraking) {
          controller.setWheelEngineForce(i, 0);
        } else {
          // 简易限速：如果超速且还在加速，就切断动力
          if (currentSpeedAbs > maxSpeed && Math.sign(accelInput) === Math.sign(forwardSpeed)) {
             controller.setWheelEngineForce(i, 0);
          } else {
             controller.setWheelEngineForce(i, accelInput * engineForce);
          }
        }
      }

      // D. [物理] 刹车应用
      if (isBraking) {
        controller.setWheelBrake(i, brakeForce);
      } else {
        controller.setWheelBrake(i, 0); 
      }
    }
  }
}