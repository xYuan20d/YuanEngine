// src/utils/props.ts

// 将 { mass: { type: 'number', value: 1 } } 转换为 { mass: 1 }
export const flattenProps = (props: any) => {
  if (!props) return {}
  const res: any = {}
  
  for (const key in props) {
    const item = props[key]
    
    // 检查是否为 "新结构" (包含 type 和 value)
    if (item && typeof item === 'object' && 'value' in item && 'type' in item) {
      res[key] = item.value // ✅ 解压：只取 value
    } else {
      res[key] = item // 🧱 兼容：如果是旧数据或普通数据，直接通过
    }
  }
  
  return res
}