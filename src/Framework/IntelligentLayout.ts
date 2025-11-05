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

    private static activePopupWindows: Map<HTMLElement, { popupInfo: PopupInfo; popupComponent: AComponent }> = new Map();

    /**
     * 返回指定弹窗根节点的最新 PopupInfo 缓存
     * 未传入或未命中时返回 null，调用方可据此触发重新检测
     */
    public static getActivePopupWindowInfo(popupRoot?: HTMLElement): PopupInfo | null {
        if (!popupRoot) {
            return null;
        }

        const entry = IntelligentLayout.activePopupWindows.get(popupRoot);
        return entry?.popupInfo ?? null;
    }

    /**
     * 返回指定弹窗根节点对应的 PopupWindowRelayout 实例
     * 若未命中则返回 null，之后会在 calculateForPopWin 内创建新实例
     */
    public static getActivePopupWindowComponent(popupRoot?: HTMLElement): AComponent | null {
        if (!popupRoot) {
            return null;
        }

        const entry = IntelligentLayout.activePopupWindows.get(popupRoot);
        return entry?.popupComponent ?? null;
    }

    /**
     * 获取当前缓存的所有弹窗信息快照，用于遍历/批处理场景
     */
    public static getActivePopupInfos(): PopupInfo[] {
        return Array.from(IntelligentLayout.activePopupWindows.values(), entry => entry.popupInfo);
    }

    /**
     * 将弹窗快照与对应组件写入缓存，key 为弹窗根节点
     */
    private static setActivePopupWindow(popupInfo: PopupInfo, component: AComponent): void {
        IntelligentLayout.activePopupWindows.set(popupInfo.root_node, {
            popupInfo,
            popupComponent: component,
        });
    }

    /**
     * 移除指定弹窗的缓存；未传入参数时清空全部缓存
     */
    public static clearActivePopupWindow(popupRoot?: HTMLElement): void {
        if (popupRoot) {
            IntelligentLayout.activePopupWindows.delete(popupRoot);
            return;
        }
        IntelligentLayout.activePopupWindows.clear();
    }
    
    public static intelligentLayout(root: HTMLElement): void {
        Log.info('进入 intelligentLayout', IntelligentLayout.TAG);

        const existingPopupInfos = IntelligentLayout.getActivePopupInfos();
        const detectedPopup = PopupWindowDetector.findPopups(root);

        if (detectedPopup) {
            Log.d(`popupInfo root_node: ${detectedPopup.root_node?.className}`, IntelligentLayout.TAG);
        } else {
            Log.d('popupInfo root_node: null', IntelligentLayout.TAG);
        }

        const popupsToProcess = new Map<HTMLElement, PopupInfo>();
        existingPopupInfos.forEach(info => {
            if (info?.root_node) {
                popupsToProcess.set(info.root_node, info);
            }
        });

        if (detectedPopup?.root_node) {
            popupsToProcess.set(detectedPopup.root_node, detectedPopup);
        }

        if (popupsToProcess.size > 0) {
            popupsToProcess.forEach(popup => IntelligentLayout.calculateForPopWin(popup));
        } else {
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

        for (const [root, entry] of IntelligentLayout.activePopupWindows.entries()) {
            const popupInfo = entry.popupInfo;
            if (!popupInfo?.root_node) {
                continue;
            }

            if (node.contains(popupInfo.root_node)) {
                Log.info(`弹窗消失: ${popupInfo.root_node}`, IntelligentLayout.TAG);
                PopupStateManager.clearState(popupInfo.root_node);
                IntelligentLayout.clearActivePopupWindow(root);
                removed = true;
            }
        }

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
        for (const { popupInfo, popupComponent } of IntelligentLayout.activePopupWindows.values()) {
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
        const entries = Array.from(IntelligentLayout.activePopupWindows.entries());

        if (entries.length === 0) {
            IntelligentLayout.clearActivePopupWindow();
            return;
        }

        entries.forEach(([root, { popupInfo, popupComponent }]) => {
            if (!popupInfo?.root_node || !popupComponent) {
                IntelligentLayout.clearActivePopupWindow(root);
                return;
            }

            Log.d(`处理弹窗: ${popupInfo.root_node?.className}`, IntelligentLayout.TAG);

            if (popupComponent instanceof PopupWindowRelayout) {
                popupComponent.cancelPendingValidation();
                popupComponent.restoreStyles();
            }

            PopupStateManager.resetState(popupInfo.root_node, reason);
            popupComponent.setDirty(true);
            IntelligentLayout.clearActivePopupWindow(root);
        });

        Log.d('所有弹窗状态重置完成', IntelligentLayout.TAG);
    }

    static reInit(reason: string): void {
        IntelligentLayout.resetPopWindows(reason);
    }
}
