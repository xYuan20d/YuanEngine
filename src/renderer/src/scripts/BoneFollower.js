/**
 * BoneFollower.js
 * 修复版：修复场景查找报错 + 优化调试打印顺序
 */
export default class BoneFollower extends Behaviour {
  
  static schema = {
    targetNode: { type: PropType.Node, default: null, label: '目标模型' },
    boneName: { type: PropType.String, default: '', label: '骨骼名称' },
    offset: { type: PropType.Vector3, default: [0, 0, 0], label: '位置偏移' },
    debug: { type: PropType.Boolean, default: false, label: '打印骨骼列表' }
  }

  onStart() {
    this.targetBone = null;
    
    // 0. 安全检查
    if (!this.inputs.targetNode) {
       console.warn("[BoneFollower] ❌ 未指定目标模型 (Target Node)");
       return;
    }

    // 1. 查找目标模型 (使用修复后的查找函数)
    const targetObj = this.findObjectByNodeId(this.inputs.targetNode);
    
    if (targetObj) {
      // 🟢 调试模式：在报错前先打印所有可用骨骼
      if (this.inputs.debug) {
         const bones = [];
         targetObj.traverse(c => { 
           // 收集所有是骨骼或者是 SkinnedMesh 的节点
           if(c.isBone || c.type === 'Bone') bones.push(c.name);
         });
         console.group(`[BoneFollower] 模型 "${targetObj.name}" 骨骼清单:`);
         console.log(bones);
         console.groupEnd();
      }

      // 2. 检查有没有填名字
      if (!this.inputs.boneName) {
        console.warn(`[BoneFollower] ⚠️ 已找到模型，但未填写 [Bone Name]。请查看上方列表填入。`);
        return;
      }

      // 3. 递归查找指定骨骼
      targetObj.traverse((child) => {
        if ((child.isBone || child.type === 'Bone') && child.name === this.inputs.boneName) {
          this.targetBone = child;
        }
      });
      
      if (!this.targetBone) {
        console.warn(`[BoneFollower] ❌ 在模型中找不到名为 "${this.inputs.boneName}" 的骨骼`);
      } else {
        console.log(`[BoneFollower] ✅ 绑定成功: ${this.targetBone.name}`);
      }
    } else {
      console.warn(`[BoneFollower] ❌ 无法找到 ID 为 "${this.inputs.targetNode}" 的模型对象`);
    }
    
    // 获取刚体
    this.rb = this.getRigidBody();
  }

  onUpdate() {
    if (!this.targetBone || !this.rb) return;

    // 1. 获取骨骼的世界坐标
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    
    this.targetBone.updateMatrixWorld(true);
    this.targetBone.getWorldPosition(worldPos);
    this.targetBone.getWorldQuaternion(worldQuat);
    
    // 应用偏移
    worldPos.x += this.inputs.offset[0];
    worldPos.y += this.inputs.offset[1];
    worldPos.z += this.inputs.offset[2];

    // 2. 瞬移物理刚体 (仅支持 Kinematic 类型)
    if (this.rb.bodyType() === 1) { // KinematicPositionBased
      this.rb.setNextKinematicTranslation(worldPos);
      this.rb.setNextKinematicRotation(worldQuat);
    } else {
      // 如果不是 Kinematic，强行设置位置(不推荐，容易穿模)
      this.rb.setTranslation(worldPos, true);
      this.rb.setRotation(worldQuat, true);
    }
  }
  
  // 🟢 修复后的查找函数：向上查找根节点，再向下查找目标
  findObjectByNodeId(targetId) {
    // 1. 找到场景根节点 (不断向上找 parent)
    let root = this.gameObject;
    while (root.parent) {
      root = root.parent;
    }

    // 2. 从根节点向下遍历查找
    let result = null;
    root.traverse((child) => {
      if (result) return; // 找到后停止
      if (child.userData && child.userData.id === targetId) {
        result = child;
      }
    });
    return result;
  }
}