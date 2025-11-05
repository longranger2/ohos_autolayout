import { AComponent } from './Common/base/AComponent';
import { LayoutConstraintMetrics } from './Common/LayoutConstraintDetector';
import Utils from './Utils/Utils';
import { PopupWindowRelayout } from './Popup/PopupWindowRelayout';
import { PopupWindowDetector } from './Popup/PopupWindowDetector';
import { PopupInfo } from './Popup/PopupInfo';
import Log from '../Debug/Log';
import Tag from '../Debug/Tag';
import { PopupStateManager } from './Popup/PopupStateManager';
import { PopupLayoutState } from './Popup/PopupLayoutState';

export default class IntelligentLayout {
    static TAG = Tag.intelligentLayout;

    private static activePopupWindowMap: Map<PopupInfo, AComponent> = new Map();

    private static findEntry(popupRoot?: HTMLElement): { popupInfo: PopupInfo; popupComponent: AComponent } | null {
        if (!popupRoot) {
            const iterator = IntelligentLayout.activePopupWindowMap.entries().next();
            if (iterator.done) {
                return null;
            }
            const [popupInfo, popupComponent] = iterator.value;
            return { popupInfo, popupComponent };
        }

        for (const [popupInfo, popupComponent] of IntelligentLayout.activePopupWindowMap.entries()) {
            if (popupInfo?.root_node === popupRoot) {
                return { popupInfo, popupComponent };
            }
        }

        return null;
    }

    private static removeEntries(predicate: (popupInfo: PopupInfo) => boolean): void {
        const entries = Array.from(IntelligentLayout.activePopupWindowMap.keys());
        entries.forEach(info => {
            if (predicate(info)) {
                IntelligentLayout.activePopupWindowMap.delete(info);
            }
        });
    }

    /**
     * 返回指定弹窗根节点的最新 PopupInfo 缓存
     * - 未传参：兼容旧流程，返回缓存中的首个弹窗信息
     * - 传入 popupRoot：按 root_node 精确匹配缓存条目
     * 未命中则返回 null，调用方可据此触发重新检测
     */
    public static getActivePopupWindowInfo(popupRoot?: HTMLElement): PopupInfo | null {
        const entry = IntelligentLayout.findEntry(popupRoot);
        return entry?.popupInfo ?? null;
    }

    /**
     * 返回指定弹窗根节点对应的 PopupWindowRelayout 实例
     * 查找规则同 getActivePopupWindowInfo，未命中时返回 null
     */
    public static getActivePopupWindowComponent(popupRoot?: HTMLElement): AComponent | null {
        const entry = IntelligentLayout.findEntry(popupRoot);
        return entry?.popupComponent ?? null;
    }

    /**
     * 获取当前缓存的所有弹窗信息快照，用于遍历/批处理场景
     */
    public static getActivePopupInfos(): PopupInfo[] {
        return Array.from(IntelligentLayout.activePopupWindowMap.keys());
    }

    /**
     * 将弹窗快照与对应组件写入缓存，以 PopupInfo 作为 key，同时替换相同 root 节点的旧条目
     */
    private static setActivePopupWindow(popupInfo: PopupInfo, component: AComponent): void {
        IntelligentLayout.removeEntries(info => info.root_node === popupInfo.root_node);
        IntelligentLayout.activePopupWindowMap.set(popupInfo, component);
    }

    /**
     * 移除指定弹窗的缓存；未传入参数时清空全部缓存
     */
    public static clearActivePopupWindow(popupRoot?: HTMLElement): void {
        if (popupRoot) {
            IntelligentLayout.removeEntries(info => info.root_node === popupRoot || popupRoot.contains(info.root_node));
            return;
        }
        IntelligentLayout.activePopupWindowMap.clear();
    }
    
    public static intelligentLayout(root: HTMLElement): void {
        Log.info('进入 intelligentLayout', IntelligentLayout.TAG);

        const cachedPopup = IntelligentLayout.getActivePopupWindowInfo(root);
        const popupInfo = cachedPopup ?? PopupWindowDetector.findPopups(root);

        if (popupInfo) {
            if (!cachedPopup) {
                Log.d(`popupInfo root_node: ${popupInfo.root_node?.className}`, IntelligentLayout.TAG);
            }
            IntelligentLayout.calculateForPopWin(popupInfo);
        } else {
            Log.d('popupInfo root_node: null', IntelligentLayout.TAG);

            let metrics: LayoutConstraintMetrics = {
                resultCode: -2,
                errorMsg: 'no popup found',
                duration: 0,
                report: 'no popup found',
            };
            // @ts-ignore
            window.layoutConstraintResult = metrics;
        }
        Log.info('离开 intelligentLayout', IntelligentLayout.TAG);
    }

    public static removePopwinCache(node: HTMLElement): boolean {
        let removed = false;

        const cachedInfos = Array.from(IntelligentLayout.activePopupWindowMap.keys());
        cachedInfos.forEach(info => {
            if (!info?.root_node) {
                return;
            }

            if (node.contains(info.root_node)) {
                Log.info(`弹窗消失: ${info.root_node}`, IntelligentLayout.TAG);
                PopupStateManager.clearState(info.root_node);
                IntelligentLayout.clearActivePopupWindow(info.root_node);
                removed = true;
            }
        });

        return removed;
    }

    static calculateForPopWin(popupInfo: PopupInfo): void {
        Log.d(`calculate for popWindow ${popupInfo?.root_node?.className}`, IntelligentLayout.TAG);
        
        //  步骤1：检查弹窗状态机 - 是否可以开始布局
        if (!PopupStateManager.canStartLayout(popupInfo.root_node)) {
            PopupStateManager.printState(popupInfo.root_node, '跳过布局 - 弹窗正在处理中');
            return;
        }
        
        let activePopupComponent = IntelligentLayout.getActivePopupWindowComponent(popupInfo.root_node);

        if (!activePopupComponent) {
            activePopupComponent = new PopupWindowRelayout(popupInfo);
        }

        IntelligentLayout.setActivePopupWindow(popupInfo, activePopupComponent);

        if (activePopupComponent.isDirty()) {
            try {
                activePopupComponent.intelligenceLayout();
            } catch (error) {
                //  步骤4：布局失败
                PopupStateManager.setState(popupInfo.root_node, PopupLayoutState.FAILED, `布局失败: ${error}`);
                Log.e(`布局失败: ${error}`, IntelligentLayout.TAG);
            }
        }

        // @ts-ignore
        window.popupInfo = popupInfo;
    }

    // 新增节点是某个组件下的节点，标记这个组件为脏，下一次布局的时候，只需要布局这个组件就可以了
    static markDirty(item: HTMLElement): void {
        if(!item || Utils.shouldSkip(item)) {
            return;
        }

        // 节点变化，就重新刷新界面
        for (const [popupInfo, popupComponent] of IntelligentLayout.activePopupWindowMap.entries()) {
            if (!popupInfo?.root_node || !popupComponent || popupComponent.isDirty()) {
                continue;
            }

            if (popupInfo.root_node.contains(item)) {
                popupComponent.setDirty(true);
            }
        }
    }

    static resetPopWindows(reason: string): void {
        Log.d('========== 重置所有弹窗状态并取消异步任务 ==========', IntelligentLayout.TAG);
        const entries = Array.from(IntelligentLayout.activePopupWindowMap.entries());

        if (entries.length === 0) {
            IntelligentLayout.clearActivePopupWindow();
            return;
        }

        entries.forEach(([popupInfo, popupComponent]) => {
            if (!popupInfo?.root_node || !popupComponent) {
                IntelligentLayout.clearActivePopupWindow(popupInfo?.root_node);
                return;
            }

            Log.d(`处理弹窗: ${popupInfo.root_node?.className}`, IntelligentLayout.TAG);

            if (popupComponent instanceof PopupWindowRelayout) {
                popupComponent.cancelPendingValidation();
                popupComponent.restoreStyles();
            }

            PopupStateManager.resetState(popupInfo.root_node, reason);
            popupComponent.setDirty(true);
            IntelligentLayout.clearActivePopupWindow(popupInfo.root_node);
        });

        Log.d('所有弹窗状态重置完成', IntelligentLayout.TAG);
    }

    static reInit(reason: string): void {
        IntelligentLayout.resetPopWindows(reason);
    }
}
