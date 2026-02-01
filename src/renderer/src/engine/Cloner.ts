// src/engine/Cloner.ts
import { IGameNode } from '../types/schema'

export class Cloner {
  
  /**
   * 克隆节点（核心入口）
   * @param sourceNode 要复制的源节点数据
   * @param targetRootId (可选) 强制指定根节点的 ID。用于“硬替换”时保持引用一致性。
   */
  static instantiate(sourceNode: IGameNode, targetRootId?: string): IGameNode {
    // 1. 深拷贝
    const clone = JSON.parse(JSON.stringify(sourceNode)) as IGameNode

    // 2. 准备映射表
    const idMap = new Map<string, string>()

    // Pass 1: ID 重生 (支持定向 ID)
    this._regenerateIdsRecursive(clone, idMap, targetRootId)

    // Pass 2: 引用修复
    this._remapReferencesRecursive(clone, idMap)

    return clone
  }

  // --- Pass 1: ID 重生 ---
  private static _regenerateIdsRecursive(
    node: IGameNode, 
    map: Map<string, string>, 
    targetId?: string // 仅根节点会收到这个参数
  ) {
    const oldId = node.id
    
    // 🟢 关键修改：如果是根节点且指定了目标 ID，就用目标的，否则生成新的
    const newId = targetId || this._generateUUID()
    
    // 登记造册
    map.set(oldId, newId)
    
    // 修改自己的 ID
    node.id = newId
    
    // 递归处理子孙 (子孙永远生成新 ID，不传 targetId)
    if (node.children) {
      node.children.forEach(child => this._regenerateIdsRecursive(child, map))
    }
  }

  // --- Pass 2: 引用修复 (保持不变) ---
  private static _remapReferencesRecursive(node: IGameNode, map: Map<string, string>) {
    if (node.components) {
      node.components.forEach(comp => {
        if (comp.props) this._scanAndRemap(comp.props, map)
        if (comp.props.userValues) this._scanAndRemap(comp.props.userValues, map)
      })
    }
    if (node.children) {
      node.children.forEach(child => this._remapReferencesRecursive(child, map))
    }
  }

  // --- 核心查找算法 (保持不变) ---
  private static _scanAndRemap(targetObj: any, map: Map<string, string>) {
    if (!targetObj || typeof targetObj !== 'object') return

    for (const key in targetObj) {
      const prop = targetObj[key]
      if (prop && typeof prop === 'object' && prop.type === 'node' && typeof prop.value === 'string') {
        const oldRefId = prop.value
        if (map.has(oldRefId)) {
          prop.value = map.get(oldRefId)
        }
      }
    }
  }

  private static _generateUUID(): string {
    return 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5)
  }
}