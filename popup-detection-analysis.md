# 弹窗错误识别问题分析报告

## 问题概述

PopupWindowDetector 将一个非弹窗元素错误识别为弹窗内容节点，导致整个页面被误判为弹窗。

## 日志关键信息

```
[11:36:25.297] 找到潜在Mask[Case1-半透明]: a-view rax-view-v2 a-a0_mc b-a0_mc, 屏占比: 100.00
[11:36:25.305] 🔄 更新最佳候选: a-view rax-view-v2 a-d_mc, 屏占比=100.00, z-index=0
[11:36:25.307] ✅ 找到最佳候选: a-view rax-view-v2 a-d_mc, 最大屏占比=100.00
[11:36:25.308] 最终选定最顶层弹窗: a-view rax-view-v2 a-aY_mc undefined, 类型: 2
```

## 核心问题

### 1. **内容节点屏占比异常**
- **Mask节点**屏占比：100% ✅ （正常）
- **内容节点**屏占比：100% ❌ （异常）

弹窗内容节点的屏占比通常应该在 **15% - 90%** 之间。当内容节点屏占比达到 100% 时，很可能是**页面主体内容**，而非弹窗内容。

### 2. **算法缺陷定位**

#### 问题代码位置 1：`findBestCandidateInSibling` (319-374行)

```typescript
for (const node of candidates) {
    const nodeZIndex = Utils.zIndexToNumber(window.getComputedStyle(node).zIndex);
    
    if (nodeZIndex >= maskZIndex + maskZIndexOffset) {
        qualifiedCount++;
        const ratio = Utils.getScreenAreaRatio(node);
        
        if (ratio > maxRatio) {  // ⚠️ 问题：只选择最大屏占比，没有上限检查
            maxRatio = ratio;
            bestCandidate = node;
        }
    }
}
```

**问题**：
- 算法选择屏占比**最大**的节点作为内容节点
- 没有对屏占比设置**上限**
- 导致屏占比 100% 的页面主体被误认为弹窗内容

#### 问题代码位置 2：`findBestSiblingContent` (381-408行)

```typescript
const minThreshold = CCMConfig.getInstance().getMinContentAreaRatioThreshold();
const found = maxRatio >= minThreshold;  // ⚠️ 只检查下限，没有检查上限
```

**问题**：
- 只检查了最小阈值（15%）
- 没有检查最大阈值
- 允许 100% 屏占比的节点通过验证

### 3. **为什么会误判**

典型场景：
```
页面结构：
├── 半透明遮罩层（100%屏占比，z-index: -998）
├── 页面主体内容（100%屏占比，z-index: 0）  ← 被误判为弹窗内容
└── Toast提示（很小，z-index: 0）
```

算法的判断过程：
1. ✅ 找到半透明遮罩层（100%屏占比）
2. ✅ 在兄弟节点中查找内容（z-index >= -998）
3. ❌ 找到页面主体（100%屏占比，z-index=0），认为是"最佳候选"
4. ❌ 100% >= 15%（最小阈值），验证通过
5. ❌ 最终将页面主体误判为弹窗内容

## 修复方案

### 方案 1：添加最大屏占比阈值（推荐）

#### 1.1 在配置中添加新参数

```typescript
// CCMConfig.ts
export interface ICCMConfigBase {
  minContentAreaRatioThreshold: number;  // 现有：最小阈值 15%
  maxContentAreaRatioThreshold: number;  // 新增：最大阈值 90%
}

const defaultCCMConfig: ICCMConfig = {
  minContentAreaRatioThreshold: 15,
  maxContentAreaRatioThreshold: 90,  // 新增默认值
  // ... 其他配置
};
```

#### 1.2 修改 `findBestCandidateInSibling` 方法

```typescript
private static findBestCandidateInSibling(...): { candidate: Element | null; ratio: number } {
    const minThreshold = CCMConfig.getInstance().getMinContentAreaRatioThreshold();
    const maxThreshold = CCMConfig.getInstance().getMaxContentAreaRatioThreshold();
    
    for (const node of candidates) {
        const nodeZIndex = Utils.zIndexToNumber(window.getComputedStyle(node).zIndex);
        
        if (nodeZIndex >= maskZIndex + maskZIndexOffset) {
            const ratio = Utils.getScreenAreaRatio(node);
            
            // 新增：检查屏占比是否在合理范围内
            if (ratio >= minThreshold && ratio <= maxThreshold) {
                if (ratio > maxRatio) {
                    maxRatio = ratio;
                    bestCandidate = node;
                }
            } else if (ratio > maxThreshold) {
                Log.d(`⚠️ 过滤节点（屏占比过大）: ${(node as HTMLElement).className}, 屏占比=${ratio.toFixed(2)}`, Tag.popupDetector);
            }
        }
    }
}
```

#### 1.3 修改 `findBestSiblingContent` 方法

```typescript
private static findBestSiblingContent(...): [Element | null, Element | null] {
    const minThreshold = CCMConfig.getInstance().getMinContentAreaRatioThreshold();
    const maxThreshold = CCMConfig.getInstance().getMaxContentAreaRatioThreshold();
    
    // ... 遍历兄弟节点的代码 ...
    
    // 新增：检查范围
    const found = maxRatio >= minThreshold && maxRatio <= maxThreshold;
    
    if (maxRatio > maxThreshold) {
        Log.d(`❌ 兄弟节点屏占比过大（${maxRatio.toFixed(2)}% > ${maxThreshold}%），可能是页面主体`, Tag.popupDetector);
    }
    
    return found ? [bestCandidate, root] : [null, null];
}
```

### 方案 2：优化选择策略

除了添加上限，还可以优化选择逻辑：

```typescript
// 不是选择"最大"屏占比，而是选择"最合理"的屏占比
// 弹窗内容通常在 40-70% 之间
const IDEAL_CONTENT_RATIO = 60; // 理想屏占比

for (const node of candidates) {
    const ratio = Utils.getScreenAreaRatio(node);
    
    if (ratio >= minThreshold && ratio <= maxThreshold) {
        // 计算与理想值的差距
        const distance = Math.abs(ratio - IDEAL_CONTENT_RATIO);
        
        // 选择最接近理想值的节点
        if (distance < minDistance) {
            minDistance = distance;
            bestCandidate = node;
            maxRatio = ratio;
        }
    }
}
```

## 建议的配置参数

```typescript
minContentAreaRatioThreshold: 15,   // 最小 15%（排除太小的元素）
maxContentAreaRatioThreshold: 90,   // 最大 90%（排除全屏主体）
idealContentAreaRatio: 60,          // 理想值 60%（可选）
```

## 测试用例

修复后应该能正确处理以下场景：

1. ✅ **正常弹窗**：Mask 100% + 内容 60% → 正确识别
2. ✅ **底部弹窗**：Mask 100% + 内容 40% → 正确识别
3. ✅ **全屏页面**：Mask 100% + 内容 100% → 拒绝识别（本案例）
4. ✅ **小弹窗**：Mask 100% + 内容 20% → 正确识别

## 总结

**根本原因**：算法假设"屏占比最大"的节点就是弹窗内容，但忽略了页面主体也可能是全屏的情况。

**修复策略**：添加最大屏占比阈值（90%），拒绝识别屏占比过大的节点，避免将页面主体误判为弹窗内容。
