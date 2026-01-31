// src/engine/Cloner.ts
import { IGameNode } from '../types/schema'

export class Cloner {
  
  /**
   * 克隆节点（核心入口）
   * @param sourceNode 要复制的源节点数据 (JSON)
   * @returns 克隆出来的、ID已重置、引用已修复的新节点数据
   */
  static instantiate(sourceNode: IGameNode): IGameNode {
    // 1. 深拷贝：斩断与源对象的内存联系
    // 这是最快最安全的“死数据”拷贝方式
    const clone = JSON.parse(JSON.stringify(sourceNode)) as IGameNode

    // 2. 准备映射表：记录 { 旧ID -> 新ID }
    const idMap = new Map<string, string>()

    // Pass 1: 遍历树，生成新 ID，并填表
    this._regenerateIdsRecursive(clone, idMap)

    // Pass 2: 再次遍历树，修复所有 { type: 'node' } 的引用
    this._remapReferencesRecursive(clone, idMap)

    return clone
  }

  // --- Pass 1: ID 重生 ---
  private static _regenerateIdsRecursive(node: IGameNode, map: Map<string, string>) {
    const oldId = node.id
    const newId = this._generateUUID() // 生成新 ID
    
    // 登记造册：老王变成了小王
    map.set(oldId, newId)
    
    // 修改自己的 ID
    node.id = newId
    
    // 递归处理子孙
    if (node.children) {
      node.children.forEach(child => this._regenerateIdsRecursive(child, map))
    }
  }

  // --- Pass 2: 引用修复 ---
  private static _remapReferencesRecursive(node: IGameNode, map: Map<string, string>) {
    // 1. 检查组件里的属性
    if (node.components) {
      node.components.forEach(comp => {
        // 合并 props 和 userValues (脚本才有 userValues) 进行统一检查
        // 注意：这里只是为了遍历方便，修改时要修改原始对象
        
        // A. 检查 props (内置组件，如 VehicleChassis 的 connectedBody)
        if (comp.props) {
          this._scanAndRemap(comp.props, map)
        }
        
        // B. 检查 userValues (脚本组件的变量)
        if (comp.props.userValues) {
          this._scanAndRemap(comp.props.userValues, map)
        }
      })
    }

    // 2. 递归子孙
    if (node.children) {
      node.children.forEach(child => this._remapReferencesRecursive(child, map))
    }
  }

  // --- 核心查找算法 ---
  private static _scanAndRemap(targetObj: any, map: Map<string, string>) {
    if (!targetObj || typeof targetObj !== 'object') return

    for (const key in targetObj) {
      const prop = targetObj[key]
      
      // 🟢 关键：识别 Typed Value
      // 只要长得像 { type: 'node', value: 'xxx' }，不管它是谁，一律查表
      if (prop && typeof prop === 'object' && prop.type === 'node' && typeof prop.value === 'string') {
        
        const oldRefId = prop.value
        
        // 查表：这个 ID 在这次克隆的范围内吗？
        if (map.has(oldRefId)) {
          // 在！说明是内部引用，替换成新的
          prop.value = map.get(oldRefId)
          // console.log(`[Cloner] Remapped reference ${key}: ${oldRefId} -> ${prop.value}`)
        } else {
          // 不在！说明是外部引用，保持不变
          // console.log(`[Cloner] Kept external reference ${key}: ${oldRefId}`)
        }
      }
    }
  }

  // 简单的 UUID 生成器
  private static _generateUUID(): string {
    return 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5)
  }
}