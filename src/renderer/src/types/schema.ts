// src/types/schema.ts

export type Vector3Array = [number, number, number]

// 1. 组件数据定义
// src/types/schema.ts

export interface IComponent {
  type: 'Mesh' | 'Light' | 'Camera' | 'Script' | 'RigidBody' | 'VehicleChassis' | 'VehicleWheel'
  active?: boolean
  props: {
    // RigidBody 特有属性
    bodyType?: 'dynamic' | 'fixed' | 'kinematicPositionBased'
    mass?: number
    linearDamping?: number
    angularDamping?: number
    restitution?: number // 弹性
    friction?: number    // 摩擦力
    colliderType?: 'primitive' | 'hull' | 'trimesh'

    // --- 新增：车身组件 ---
    // VehicleChassis 不需要太多参数，主要靠代码逻辑，但可以暴露悬挂参数
    centerOfMassOffset?: [number, number, number]
    
    // --- 新增：车轮组件 ---
    isSteering?: boolean // 是否负责转向
    isDrive?: boolean    // 是否负责驱动 (动力轮)
    brakeForce?: number  // 刹车力度
    
    // 悬挂微调参数 (虽然自动校准，但允许用户微调)
    suspensionRestLength?: number // 悬挂自然长度
    suspensionStiffness?: number  // 硬度
    maxSuspensionTravel?: number  // 最大行程
    radiusScale?: number // 半径缩放 (用于微调自动计算的结果)

    // Script 组件特有的 props 结构
    // 脚本文件的绝对路径 (Electron 环境) 或 URL
    src?: string 
    // 脚本的名字 (用于显示)
    name?: string 
    // 存储用户在 Inspector 设置的值
    // 比如: { speed: 5.0, isActive: false }
    userValues?: Record<string, any> 
    
    // 其他标准组件的 props...
    [key: string]: any 
  }
}

// 2. 节点定义 (递归的核心)
export interface IGameNode {
  id: string
  name: string
  active: boolean
  
  // 变换属性
  position: Vector3Array
  rotation: Vector3Array
  scale: Vector3Array

  // 挂载的组件列表 (比如 "BoxGeometry", "PointLight")
  components: IComponent[]

  // 子节点 (递归)
  children?: IGameNode[]
}
