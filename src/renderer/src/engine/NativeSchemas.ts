import { PropType } from './Engine'

// 定义 Schema 的接口，方便类型提示
export interface SchemaDef {
  type: PropType
  default: any
  label?: string
  min?: number
  max?: number
  step?: number
  options?: string[]
}

export const NativeSchemas: Record<string, Record<string, SchemaDef>> = {
  
  // 1. Mesh 组件
  // 对应 InspectorPanel.vue 第 254 行
  Mesh: {
    geometry: { 
      type: PropType.String, 
      default: 'Box', 
      // ⚠️ 必须首字母大写，对应 TresJS 组件逻辑
      options: ['Box', 'Sphere', 'Cylinder', 'Plane'], 
      label: 'Geometry' 
    },
    color: { 
      type: PropType.Color, 
      default: '#ffffff', 
      label: 'Color' 
    }
    // 注意：args 在原版 Inspector 中未暴露给用户修改，所以这里暂时不加
  },

  // 2. Light 组件
  // 对应 InspectorPanel.vue 第 241 行
  Light: {
    intensity: { 
      type: PropType.Number, 
      default: 1.0, 
      min: 0, 
      step: 0.1, 
      label: 'Intensity' 
    },
    color: { 
      type: PropType.Color, 
      default: '#ffffff', 
      label: 'Color' 
    }
  },

  // 3. Camera 组件
  // 对应 InspectorPanel.vue 第 223 行
  Camera: {
    isMain: { 
      type: PropType.Boolean, 
      default: false, 
      label: 'Is Main' 
    },
    fov: { 
      type: PropType.Number, 
      default: 60, 
      min: 1, 
      max: 179, 
      label: 'FOV' 
    },
    near: { 
      type: PropType.Number, 
      default: 0.1, 
      min: 0.01, 
      label: 'Near' 
    },
    far: { 
      type: PropType.Number, 
      default: 1000, 
      min: 0.1, 
      label: 'Far' 
    }
  },

  // 4. RigidBody 组件
  // 对应 InspectorPanel.vue 第 308 行
  RigidBody: {
    isTrigger: { 
      type: PropType.Boolean, 
      default: false, 
      label: 'Is Trigger' 
    },
    colliderType: { 
      type: PropType.String, 
      default: 'primitive', 
      // ⚠️ 严格对应 Rapier 的类型字符串
      options: ['primitive', 'hull', 'trimesh'], 
      label: 'Shape' 
    },
    bodyType: { 
      type: PropType.String, 
      default: 'dynamic', 
      // ⚠️ 这是一个极易出错的点：kinematicPositionBased 必须驼峰，不能错！
      options: ['dynamic', 'fixed', 'kinematicPositionBased'], 
      label: 'Type' 
    },
    mass: { 
      type: PropType.Number, 
      default: 1.0, 
      step: 0.1, 
      label: 'Mass (kg)' 
    },
    restitution: { 
      type: PropType.Number, 
      default: 0.5, 
      min: 0, 
      max: 1, 
      step: 0.1, 
      label: 'Bounce' 
    },
    friction: { 
      type: PropType.Number, 
      default: 0.5, 
      min: 0, 
      max: 1, 
      step: 0.1, 
      label: 'Friction' 
    }
  },

  // 5. VehicleChassis 组件
  // 对应 InspectorPanel.vue 第 273 行
  VehicleChassis: {
    centerOfMassOffset: { 
      type: PropType.Vector3, 
      default: [0, -0.5, 0], 
      label: 'CoM Offset' 
    }
  },

  // 6. VehicleWheel 组件
  // 对应 InspectorPanel.vue 第 289 行
  VehicleWheel: {
    isSteering: { 
      type: PropType.Boolean, 
      default: false, 
      label: 'Is Steering' 
    },
    isDrive: { 
      type: PropType.Boolean, 
      default: false, 
      label: 'Is Drive' 
    },
    radiusScale: { 
      type: PropType.Number, 
      default: 1.0, 
      step: 0.1, 
      label: 'Rad Scale' 
    },
    suspensionRestLength: { 
      type: PropType.Number, 
      default: 0.3, // 参照你 AddComponent 里的隐式默认值
      step: 0.05, 
      label: 'Sus Length' 
    },
    suspensionStiffness: { 
      type: PropType.Number, 
      default: 50, 
      step: 1, 
      label: 'Stiffness' 
    },
    maxSuspensionTravel: { 
      type: PropType.Number, 
      default: 0.2, 
      step: 0.05, 
      label: 'Max Travel' 
    }
    // 注意：InspectorPanel.vue 的 Template 里没有 brakeForce，但 AddComponent 里可能有
    // 如果之前界面上没显示 brakeForce，这里加了后就会显示出来，算是功能增强
  }
}