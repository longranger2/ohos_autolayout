# 弹窗错误识别问题修复总结

## 🐛 问题描述

PopupWindowDetector 错误地将一个页面背景装饰层（z-index = -998）识别为弹窗 Mask，导致整个页面被误判为弹窗。

## 🔍 根本原因

在 `isPotentialMask` 方法中，只检查了以下条件：
- ✅ 屏占比 > 阈值（100%）
- ✅ 背景半透明
- ❌ **缺少 z-index 验证**

导致 z-index = -998 的背景装饰层被误判为弹窗 Mask。

### 错误的识别流程：

```
1. 识别 Mask: z-index = -998 的半透明层 ✅ (错误地通过)
2. 设置阈值: -998 + 1 = -997
3. 查找内容: 所有 z-index >= -997 的节点都被认为是候选内容
4. 选择内容: 页面主体 (z-index = 0) 通过检查 ✅ (错误)
5. 最终结果: 整个页面被误判为弹窗 ❌
```

### 正常弹窗应该是：

```
Mask:    z-index = 1000+  (在页面上层)
Content: z-index = 1001+  (在 Mask 上层)
```

## 💡 解决方案

在 **Mask 识别阶段**添加 z-index 最小值检查（>= 0）。

### 修改位置

**文件：** `src/Framework/Popup/PopupWindowDetector.ts`  
**方法：** `isPotentialMask` (148-193行)

### 修改内容

在所有三个 Case 中添加 z-index 验证：

```typescript
private static isPotentialMask(el: Element, style: CSSStyleDeclaration): boolean {
    const screenAreaRatio = Utils.getScreenAreaRatio(el);
    const minMaskAreaRatio = CCMConfig.getInstance().getMinMaskAreaRatioThreshold();
    const zIndex = Utils.zIndexToNumber(style.zIndex);  // 新增

    // Case 1: 屏占比足够大且背景半透明
    if (screenAreaRatio > minMaskAreaRatio && Utils.isBackgroundSemiTransparent(style)) {
        // 新增：z-index 验证
        if (zIndex < 0) {
            Log.d(`❌ 过滤潜在Mask（z-index < 0）: ${(el as HTMLElement).className}, z-index=${zIndex}`, Tag.popupDetector);
            return false;
        }
        Log.d(`找到潜在Mask[Case1-半透明]: ${(el as HTMLElement).className}, 屏占比: ${screenAreaRatio.toFixed(2)}, z-index: ${zIndex}`, Tag.popupDetector);
        return true;
    }

    // Case 2 和 Case 3 也添加了相同的 z-index 验证
    // ...
}
```

### 核心逻辑

```typescript
// 弹窗 Mask 的 z-index 应该 >= 0（不能是负数）
// z-index < 0 的元素通常是背景装饰层，不可能是弹窗 Mask
if (zIndex < 0) {
    return false;  // 拒绝识别
}
```

## ✅ 验证结果

### 1. 单元测试全部通过

```
PASS tests/PopupWindowDetector.test.ts
  PopupWindowDetector
    Mask Detection
      ✓ should detect masks via transparency, child close button and box-shadow in isPotentialMask (2 ms)
      ✓ should reject masks with negative z-index in isPotentialMask (1 ms)  ← 新增测试
    ... (所有 32 个测试通过)

Coverage:
  PopupWindowDetector.ts   |     100 |      100 |     100 |     100 |
```

### 2. 新增测试用例

**文件：** `tests/PopupWindowDetector.test.ts` (441-506行)

测试覆盖了以下场景：
1. ❌ 半透明背景装饰层 (z-index = -998) → 拒绝
2. ❌ 负 z-index 的 fixed 元素 (z-index = -100) → 拒绝
3. ❌ 负 z-index 的 box-shadow 元素 (z-index = -50) → 拒绝
4. ✅ 正常弹窗 Mask (z-index = 1000) → 通过

## 📊 影响范围

### 修复前
- ❌ z-index = -998 的背景层被识别为 Mask
- ❌ 页面主体被误判为弹窗内容
- ❌ 导致整个页面被误处理

### 修复后
- ✅ z-index < 0 的元素被正确过滤
- ✅ 只有 z-index >= 0 的元素才可能是 Mask
- ✅ 避免将背景装饰层误判为弹窗

## 🎯 预期日志输出

修复后，当遇到 z-index < 0 的元素时，会输出：

```
[PopupDetector] ❌ 过滤潜在Mask（z-index < 0）: a-view rax-view-v2 a-a0_mc b-a0_mc, z-index=-998, 屏占比: 100.00
[PopupDetector] 找到 0 个潜在Mask节点
[PopupDetector] 未找到潜在Mask节点，退出检测
[PopupDetector] 弹窗检测完成，结果: 未找到弹窗
```

## 🔧 技术细节

### 为什么选择 z-index >= 0 作为阈值？

1. **z-index < 0**：元素在正常文档流之下（背后），通常是背景装饰层
2. **z-index >= 0**：元素至少与文档流齐平或在其上方
3. **弹窗 Mask**：需要遮挡页面内容，z-index 必须 >= 0

### 为什么不使用更高的阈值（如 >= 100）？

- 一些简单的弹窗实现可能使用较小的 z-index（如 10, 50）
- z-index >= 0 是一个安全且通用的阈值
- 可以通过配置系统灵活调整（如果需要）

## 📝 后续建议

如果需要更严格的过滤，可以考虑：

1. **添加可配置的最小 z-index**
   ```typescript
   // CCMConfig.ts
   minMaskZIndex: 100  // 可配置
   ```

2. **根据 position 类型区分**
   ```typescript
   // fixed/absolute 元素：z-index >= 100
   // 其他定位元素：z-index >= 0
   ```

3. **结合其他特征判断**
   - 元素的层叠上下文
   - 父元素的 z-index
   - 是否在可视区域顶层

## 🎉 总结

- **问题**：z-index < 0 的背景层被误判为弹窗 Mask
- **方案**：在 Mask 识别时添加 z-index >= 0 的检查
- **结果**：所有测试通过，100% 代码覆盖率
- **影响**：修复了严重的误判问题，提高了检测准确性

---

**修复时间：** 2025-11-12  
**修改文件：** 
- `src/Framework/Popup/PopupWindowDetector.ts`
- `tests/PopupWindowDetector.test.ts`

**测试结果：** ✅ 所有测试通过 (32/32)  
**代码覆盖率：** ✅ 100%
