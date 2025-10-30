# OHOS AutoLayout

一个面向鸿蒙OS（HarmonyOS）WebView环境的智能弹窗自动布局适配系统，通过自动检测、识别和优化弹窗组件在宽屏设备上的显示效果，提供响应式布局能力。

## 📋 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [架构设计](#架构设计)
- [技术特性](#技术特性)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [API文档](#api文档)
- [核心模块](#核心模块)
- [测试](#测试)
- [构建与部署](#构建与部署)

## 🎯 项目概述

OHOS AutoLayout 是一个运行在鸿蒙OS WebView环境中的JavaScript框架，主要解决弹窗组件在不同屏幕尺寸（特别是宽屏设备）下的自适应布局问题。系统通过智能检测、识别弹窗类型，并应用相应的布局策略（缩放、截断处理、位置调整等），确保弹窗内容在宽屏设备上能够完整、美观地显示。

### 解决的问题

- ✅ **弹窗在宽屏设备上的显示适配**：自动检测并调整弹窗尺寸和位置
- ✅ **内容截断检测与处理**：智能识别被截断的内容并进行优化
- ✅ **DOM动态变化响应**：实时监听DOM变化并自动重新布局
- ✅ **动画兼容性**：处理CSS动画/过渡期间的布局计算
- ✅ **性能优化**：通过缓存、节流、批量处理等方式提升性能

## ✨ 核心功能

### 1. 智能弹窗检测与识别

系统能够自动识别页面中的弹窗组件，支持三种弹窗结构类型：

- **A型**：content是mask的子节点（组件根节点 → mask节点 → content）
- **B型**：mask与content为兄弟节点（组件根节点 → mask节点；组件根节点 → content）
- **C型**：mask与组件根节点是同节点（组件根节点(自身是mask) → content）

弹窗类型决策树：
- **Center（中心弹窗）**：常规居中显示的弹窗
- **Bottom（底部弹窗）**：从底部弹出的模态窗口
- **Picker（选择器弹窗）**：时间选择器等特殊弹窗
- **Center_Button_Overlap（中心弹窗-按钮重叠）**：带绝对定位关闭按钮的中心弹窗

### 2. 响应式布局策略

#### 缩放策略
- 根据弹窗内容高度和视口高度自动计算缩放比例
- 支持最小缩放系数配置（默认55%）
- 缩放动画平滑过渡（可配置动画时长）

#### 截断处理
- 检测内容在视口内被截断的节点
- 检测背景图被截断但rect未截断的节点
- 对截断节点进行特殊处理或标记

#### 位置调整
- 智能调整弹窗位置以适应屏幕
- 处理吸顶/吸底元素对可视区域的影响
- 支持动态响应窗口尺寸变化

### 3. DOM变更监听

- **MutationObserver**：监听DOM树的结构变化、属性变化
- **ResizeObserver**：监听窗口尺寸变化
- **PageContentObserver**：监听页面内容就绪状态（处理骨架屏/白屏场景）
- **动画事件监听**：监听CSS动画和过渡事件，确保在动画完成后再进行布局计算

### 4. 状态管理

- **弹窗状态机**：管理弹窗从检测到布局完成的完整生命周期
  - `IDLE`：空闲状态
  - `LAYOUTING`：布局中
  - `COMPLETED`：布局完成
  - `FAILED`：布局失败
- **脏标记机制**：标记需要重新布局的组件，避免不必要的重复计算

### 5. 样式管理

- **样式缓存**：缓存计算过的样式，提升性能
- **批量样式设置**：使用`requestAnimationFrame`批量更新样式，减少重排重绘
- **样式恢复**：支持恢复弹窗原始样式

## 🏗️ 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     Main（入口模块）                       │
│  - 初始化配置                                             │
│  - 启动/停止/重启控制                                      │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Framework（框架核心）                    │
│  - 任务初始化与检查                                       │
│  - 主任务调度                                             │
│  - CSS加载状态检测                                        │
│  - 页面内容就绪检测                                       │
└────────────────────┬──────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ObserverHandler │ │ IntelligentLayout │ │ StyleSetter │
│  观察器管理    │ │   智能布局引擎   │ │  样式设置器  │
└──────┬───────┘ └──────┬───────┘ └──────────────┘
       │                │
       ▼                ▼
┌─────────────────────────────────────────────────────────┐
│               Observers（观察器组）                      │
│  - ModifyObserver（DOM变更监听）                        │
│  - ResizeObserver（窗口尺寸监听）                       │
│  - PageContentObserver（页面内容监听）                   │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Popup（弹窗处理模块）                       │
│  - PopupWindowDetector（弹窗检测器）                     │
│  - PopupWindowRelayout（弹窗重布局）                     │
│  - PopupDecisionTree（决策树）                           │
│  - PopupStateManager（状态管理）                         │
└─────────────────────────────────────────────────────────┘
```

### 核心模块

#### 1. Framework（框架核心）
- **职责**：框架生命周期管理、任务调度、条件检查
- **关键方法**：
  - `taskinit()`：任务初始化检查（屏幕、CSS加载、内容就绪）
  - `mainTask()`：主任务执行入口
  - `reInit()`：框架重新初始化

#### 2. IntelligentLayout（智能布局引擎）
- **职责**：弹窗布局计算入口、弹窗映射管理
- **关键方法**：
  - `intelligentLayout(root)`：智能布局主入口
  - `calculateForPopWin(popupInfo)`：计算弹窗布局
  - `markDirty(item)`：标记脏节点

#### 3. PopupWindowRelayout（弹窗重布局）
- **职责**：具体的弹窗布局计算逻辑
- **核心算法**：
  - 识别顶层节点和所有子孙节点
  - 计算缩放比例
  - 检测和处理截断
  - 应用布局决策树策略

#### 4. ObserverHandler（观察器管理）
- **职责**：统一管理所有观察器
- **节流机制**：使用200ms延迟的任务调度，避免频繁触发

#### 5. ModifyObserver（DOM变更监听）
- **职责**：监听DOM变化并触发重新布局
- **特性**：
  - 批处理DOM变更
  - 动画事件监听
  - 动画超时管理

## 🔧 技术特性

### 设计模式

1. **观察者模式**：DOM变更、窗口尺寸变化的监听
2. **单例模式**：配置管理（CCMConfig）
3. **策略模式**：不同类型的弹窗采用不同的布局策略
4. **状态模式**：弹窗状态机管理
5. **装饰器模式**：样式缓存装饰

### 性能优化

1. **节流（Throttle）**：DOM变更事件200ms节流
2. **样式缓存**：缓存计算过的样式属性
3. **批量更新**：使用`requestAnimationFrame`批量更新样式
4. **脏标记**：只重新布局标记为脏的组件
5. **延迟执行**：等待CSS加载完成、动画结束后再布局

### 容错机制

1. **白名单机制**：支持应用ID和页面路径的白名单配置
2. **状态检查**：多层次的条件检查（屏幕尺寸、CSS加载、内容就绪）
3. **异常捕获**：布局计算过程中的异常捕获和状态回滚
4. **跨域样式表处理**：跨域样式表访问失败的降级处理

## 🚀 快速开始

### 安装

```bash
npm install
```

### 开发构建

```bash
npm run dev
```

### 生产构建

```bash
npm run release
```

构建产物位于 `dist/sdk/webview/autolayout.min.js`

### 基本使用

```javascript
// 引入构建后的JS文件
<script src="autolayout.min.js"></script>

// 初始化配置
const config = {
  minMaskAreaRatioThreshold: 1,
  opacityFilter: [0, 100],
  minContentAreaRatioThreshold: 15,
  scrollNodePattern: ['scroll', 'List', 'swiper'],
  closeButtonPattern: ['close', 'guanbi', 'dele'],
  buttonPattern: ['button', 'btn'],
  scaleAnimationDuration: 100,
  minScaleFactor: 55,
  breakpoints: [
    { widthRange: { min: 320, max: 500 }, aspectRatioRange: { min: 0.61, max: 1.63 } },
    { widthRange: { min: 580, max: 900 }, aspectRatioRange: { min: 0.7, max: 2.0 } },
    { widthRange: { min: 1000, max: 1150 }, aspectRatioRange: { min: 1.3, max: 1.45 } }
  ],
  appRuleInfos: [
    { 'id': 'app_id_1', 'pg': ['home', 'detail'] }
  ],
  minSARTofStickyComponent: 5,
  maxSARTofStickyComponent: 45
};

// 启动框架
Main.start(JSON.stringify(config));

// 停止框架
Main.stop();

// 重启框架
Main.restart();
```

## ⚙️ 配置说明

### CCMConfig 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `minMaskAreaRatioThreshold` | number | 1 | 蒙版最小屏占比阈值（%） |
| `opacityFilter` | [number, number] | [0, 100] | 透明度筛选范围 |
| `minContentAreaRatioThreshold` | number | 15 | 弹窗内容节点最小屏占比阈值（%） |
| `scaleAnimationDuration` | number | 100 | 缩放动画时长（毫秒，50-400） |
| `minScaleFactor` | number | 55 | 最小缩放系数（%） |
| `scrollNodePattern` | string[] | ['scroll', 'List', 'swiper'] | 滚动节点特征值 |
| `closeButtonPattern` | string[] | ['close', 'guanbi', 'dele'] | 关闭按钮特征值 |
| `buttonPattern` | string[] | ['button', 'btn'] | 按钮特征值 |
| `breakpoints` | Breakpoint[] | 见下方 | 响应式断点配置 |
| `appRuleInfos` | AppRuleInfo[] | [] | 应用规则白名单 |
| `minSARTofStickyComponent` | number | 5 | 吸顶吸底元素最小高度 |
| `maxSARTofStickyComponent` | number | 45 | 吸顶吸底元素最大高度 |

### Breakpoint 配置示例

```typescript
{
  widthRange: { min: 320, max: 500 },
  aspectRatioRange: { min: 0.61, max: 1.63 }
}
```

## 📚 API文档

### Main 类

#### `Main.start(config: string): void`
启动框架，传入JSON格式的配置字符串。

#### `Main.stop(): void`
彻底关闭框架，停止所有监听和任务。

#### `Main.restart(): void`
重启框架，恢复运行状态。

### Framework 类

#### `Framework.mainTask(): void`
主任务入口，执行智能布局。

#### `Framework.recoverStyle(): void`
恢复弹窗样式。

#### `Framework.reInit(): void`
重新初始化框架。

### IntelligentLayout 类

#### `IntelligentLayout.intelligentLayout(root: HTMLElement): void`
对指定根节点执行智能布局。

#### `IntelligentLayout.relayoutForPopWin(): void`
响应式弹窗重布局（用于手动触发）。

## 🔍 核心模块详解

### 1. 弹窗检测（PopupWindowDetector）

弹窗检测流程：

1. **Mask识别**：查找与viewport尺寸一致（屏占比100%）的mask节点
2. **Content识别**：查找屏占比>40%的内容节点
3. **结构判断**：根据mask和content的关系判断弹窗类型（A/B/C型）
4. **吸顶吸底检测**：识别页面中的吸顶和吸底元素

### 2. 决策树（PopupDecisionTree）

弹窗类型决策流程：

```
弹窗
├── 是否为Picker弹窗？
│   └── 是 → Picker类型
│   └── 否 → 继续判断
├── 是否为底部弹窗？
│   └── 是 → Bottom类型
│   └── 否 → 继续判断
└── 是否为中心弹窗？
    ├── 关闭按钮是否重叠？
    │   └── 是 → Center_Button_Overlap类型
    │   └── 否 → Center类型
```

### 3. 布局计算（PopupWindowRelayout）

布局计算流程：

1. **初始化**：获取弹窗信息、计算可视高度
2. **节点筛选**：识别顶层节点和所有子孙节点
3. **决策树执行**：根据弹窗类型应用对应策略
4. **缩放计算**：计算合适的缩放比例
5. **截断检测**：检测内容是否被截断
6. **样式应用**：应用计算后的样式
7. **验证**：异步验证布局结果

### 4. 观察器系统

#### ModifyObserver
- 监听DOM变化（子节点增删、属性变化）
- 批处理变更记录
- 监听CSS动画/过渡事件
- 管理动画超时任务

#### ResizeObserver
- 监听窗口尺寸变化
- 触发全局重新布局
- 清理待处理的动画任务

#### PageContentObserver
- 检测页面内容是否就绪
- 处理骨架屏/白屏场景
- 响应式等待内容加载

## 🧪 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 监视模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 测试覆盖率

当前测试覆盖率：
- **语句覆盖率 (Statements)**: 82.82% ✅
- **分支覆盖率 (Branches)**: 71.55% ✅
- **函数覆盖率 (Functions)**: 67%
- **行覆盖率 (Lines)**: 84.5% ✅

详细测试说明请参考 [tests/README.md](tests/README.md)

## 🏭 构建与部署

### 构建配置

项目使用 Webpack 进行构建：

- **开发构建**：`build/umd/common/webpack.umd.common.js`
- **UMD格式**：输出为通用模块定义格式，可在多种环境使用
- **代码压缩**：生产环境使用 terser-webpack-plugin 压缩

### 构建产物

构建后的文件位于：
```
dist/sdk/webview/autolayout.min.js
```

### 集成到鸿蒙项目

1. 将 `autolayout.min.js` 复制到鸿蒙项目的资源目录
2. 在 HTML 中引入：
```html
<script src="path/to/autolayout.min.js"></script>
```
3. 调用 `Main.start(config)` 初始化

## 📝 开发规范

### 代码风格

- **语言**：TypeScript
- **模块系统**：ES2015 Modules
- **命名规范**：camelCase（变量/方法），PascalCase（类/接口）
- **注释**：关键函数和类需要JSDoc注释

### 目录结构

```
src/
├── Main.ts                    # 入口模块
├── Debug/                     # 调试工具
│   ├── Log.ts                # 日志系统
│   └── Tag.ts                # 标签常量
└── Framework/                 # 框架核心
    ├── Framework.ts          # 框架主类
    ├── IntelligentLayout.ts  # 智能布局引擎
    ├── Common/               # 公共模块
    ├── Observer/             # 观察器模块
    ├── Popup/                # 弹窗处理模块
    └── Utils/                # 工具类
```

## 🐛 调试

### 日志系统

框架内置了完整的日志系统，支持不同级别的日志：

```typescript
Log.d('调试信息', Tag.moduleName);    // DEBUG
Log.info('信息', Tag.moduleName);     // INFO
Log.w('警告', Tag.moduleName);        // WARN
Log.e('错误', Tag.moduleName, error); // ERROR
```

### 调试开关

设置全局变量 `__DEV__ = true` 可启用详细日志输出。

### 布局结果输出

布局计算结果会输出到全局变量：
- `window.layoutConstraintResult`：布局约束指标
- `window.popupInfo`：弹窗信息
- `window.popWin`：弹窗类型（'center' | 'bottom'）

## 🔄 版本历史

### v1.0.0
- 初始版本发布
- 支持基础弹窗检测和布局适配
- 完整的观察器系统
- 决策树支持多种弹窗类型

## 📄 许可证

Apache License 2.0

## 👥 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

如有问题或建议，请通过 Issue 反馈。

---

**注意**：本框架专为鸿蒙OS WebView环境设计，在其他环境使用时可能需要调整。

