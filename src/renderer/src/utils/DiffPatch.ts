/**
 * DiffPatch.ts
 * 一个极其轻量、高效的对象差异对比与还原工具。
 * 用于游戏引擎的关键帧压缩存储。
 */

// 1. 删除标记 (占用空间极小)
// 如果你的业务数据里恰好有这个字符串，请修改它
const DELETE_FLAG = '__$$YUANENGINE_DEL_JSON$$__';

export type DiffResult<T> = Partial<T> | typeof DELETE_FLAG | any;

/**
 * 核心工具类
 */
export class DiffUtil {
  
  /**
   * 计算差异: current相对于prev的变化
   * @param prev 上一帧的对象
   * @param curr 当前帧的对象
   * @returns 差异对象 (Delta)。如果完全相同，返回 undefined
   */
  static diff(prev: any, curr: any): any {
    // 1. 全等检查 (最快)
    if (prev === curr) return undefined;

    // 2. 如果其中一个是基础类型，或者类型不一致，直接返回新的 (覆盖)
    if (
      prev === null || curr === null ||
      typeof prev !== 'object' || typeof curr !== 'object' ||
      Array.isArray(prev) !== Array.isArray(curr)
    ) {
      return curr;
    }

    // 3. 深度对比对象/数组
    const delta: any = Array.isArray(curr) ? [] : {};
    let hasChange = false;

    // A. 检查 curr 中的属性 (新增或修改)
    for (const key in curr) {
      // 递归计算差异
      const subDiff = DiffUtil.diff(prev[key], curr[key]);
      
      // 如果有差异，记录下来
      if (subDiff !== undefined) {
        delta[key] = subDiff;
        hasChange = true;
      }
    }

    // B. 检查 prev 中的属性 (是否被删除)
    for (const key in prev) {
      if (!(key in curr)) {
        delta[key] = DELETE_FLAG;
        hasChange = true;
      }
    }

    // 特殊处理数组：如果数组长度变小了，Diff 可能会漏掉长度变化
    // (例如 [1, 2, 3] -> [1, 2]，上面的逻辑会认为 3 被删除了，但数组的 length 属性需要显式修正)
    if (Array.isArray(curr) && Array.isArray(prev)) {
       // 我们利用 DELETE_FLAG 技巧，或者简单的：
       // 如果是数组，且我们通过上面的 diff 发现变短了，patch 时通常会自动处理
       // 但为了保险，如果 delta 是数组，我们可以在还原时截断。
       // *更稳健的做法*：把数组当普通对象处理差异，但在 Patch 时修正 length。
       // 这里为了节省空间，我们不做额外处理，依托 Patch 逻辑修正。
    }

    return hasChange ? delta : undefined;
  }

  /**
   * 还原数据: 基于上一帧 + 差异 = 当前帧
   * @param prev 上一帧对象
   * @param delta 差异对象
   * @returns 还原后的完整对象 (新引用，不修改 prev)
   */
  static patch(prev: any, delta: any): any {
    // 1. 如果没有差异，直接复用上一帧
    if (delta === undefined) return prev;

    // 2. 标记处理
    if (delta === DELETE_FLAG) return undefined;

    // 3. 全量替换判断
    if (
      prev === null || delta === null ||
      typeof prev !== 'object' || typeof delta !== 'object' ||
      Array.isArray(prev) !== Array.isArray(delta)
    ) {
      return DiffUtil._cloneDeep(delta);
    }

    // 4. 深度合并
    const next = Array.isArray(prev) ? [...prev] : { ...prev };

    for (const key in delta) {
      const change = delta[key];

      if (change === DELETE_FLAG) {
        if (Array.isArray(next)) {
           delete next[key]; 
        } else {
           delete next[key];
        }
      } else {
        // 🟢 核心修复：处理 JSON 数组中的 null 空洞
        // JSON.stringify 会把数组里的 undefined 变成 null
        // 所以如果我们正在 Patch 一个数组，且遇到的 diff 是 null，说明这个位置在上一帧是 undefined (即无变化)
        // 我们应该保留 prev 里的旧值，而不是把它设为 null
        if (Array.isArray(next) && change === null) {
          continue; 
        }

        // 递归 Patch
        next[key] = DiffUtil.patch(prev[key], change);
      }
    }

    // 数组清理 (移除 delete 产生的空洞)
    if(Array.isArray(next)) {
        let i = next.length - 1;
        while (i >= 0 && !(i in next)) {
            next.length = i;
            i--;
        }
    }

    return next;
  }

  // 辅助：深拷贝，用于全量替换时的安全性
  private static _cloneDeep(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(DiffUtil._cloneDeep);
    const res: any = {};
    for (const k in obj) res[k] = DiffUtil._cloneDeep(obj[k]);
    return res;
  }
}

/**
 * 链式存储管理器 (时光机)
 * 用于管理一连串的帧
 */
export class FrameChain<T> {
  private baseFrame: T | null = null; // 关键帧 (Frame 0)
  private deltas: any[] = [];         // 差异链 (Frame 1...N)

  constructor(initialData?: T) {
    if (initialData) {
      this.baseFrame = JSON.parse(JSON.stringify(initialData));
    }
  }

  /**
   * 添加新的一帧
   * @param currentData 当前帧的完整数据
   * @returns 这一帧的体积大小 (字符数预估)
   */
  addFrame(currentData: T): number {
    // 1. 获取上一帧的完整数据
    const prevData = this.getFrame(this.deltas.length); // 这一步可能比较慢，优化点见下文
    
    // 2. 计算差异
    const delta = DiffUtil.diff(prevData, currentData);
    
    // 3. 存入链表
    this.deltas.push(delta);

    // 返回 delta 的粗略大小，方便你做存储策略
    return JSON.stringify(delta || {}).length;
  }

  /**
   * 读取任意一帧
   * @param index 帧索引 (0 是 baseFrame)
   */
  getFrame(index: number): T {
    if (index === 0) return this.baseFrame!;
    
    // 从头开始 Patch (如果是生产环境，建议每隔60帧存一个关键帧Snapshot，避免链太长)
    let result = this.baseFrame;
    for (let i = 0; i < index; i++) {
        // 容错：如果越界
        if (i >= this.deltas.length) break;
        const delta = this.deltas[i];
        result = DiffUtil.patch(result, delta);
    }
    return result as T;
  }

  /**
   * 获取所有帧的原始数据 (导出用)
   */
  export() {
    return {
      base: this.baseFrame,
      chain: this.deltas
    };
  }
}