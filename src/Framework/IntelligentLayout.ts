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

    private static activePopup: { info: PopupInfo | null; component: AComponent | null } = {
        info: null,
        component: null,
    };

    public static getActivePopupInfo(): PopupInfo | null {
        return IntelligentLayout.activePopup.info;
    }

    public static getActivePopupComponent(): AComponent | null {
        return IntelligentLayout.activePopup.component;
    }

    private static cachePopup(popupInfo: PopupInfo, component: AComponent): void {
        IntelligentLayout.activePopup = { info: popupInfo, component };
    }

    public static clearActivePopup(): void {
        IntelligentLayout.activePopup = { info: null, component: null };
    }

    /**
     * 响应开启重布局的按钮事件，局部刷新节点
     */
    public static relayoutForPopWin(): void {
        Log.info('relayoutForPopWin run', IntelligentLayout.TAG);
        const cachedPopup = IntelligentLayout.getActivePopupInfo();
        const popupInfo = cachedPopup ?? PopupWindowDetector.findPopups(document.body);

        if (popupInfo != null) {
            IntelligentLayout.calculateForPopWin(popupInfo);
        }
    }
    
    public static intelligentLayout(root: HTMLElement): void {
        Log.info('进入 intelligentLayout', IntelligentLayout.TAG);

        const cachedPopup = IntelligentLayout.getActivePopupInfo();
        const popupInfo = cachedPopup ?? PopupWindowDetector.findPopups(root);
        Log.d(`popupInfo root_node: ${popupInfo?.root_node?.className}`, IntelligentLayout.TAG);

        if (popupInfo != null) {
            IntelligentLayout.calculateForPopWin(popupInfo);
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

    public static recoverPopwinStyle(): void {
        const popupInfo = IntelligentLayout.getActivePopupInfo();
        const component = IntelligentLayout.getActivePopupComponent();

        if (!popupInfo && !component) {
            IntelligentLayout.clearActivePopup();
            return;
        }

        if (component instanceof PopupWindowRelayout) {
            component.cancelPendingValidation();
            component.restoreStyles();
        }

        if (popupInfo?.root_node) {
            PopupStateManager.resetState(popupInfo.root_node, '恢复弹窗样式并重置状态');
        }

        IntelligentLayout.clearActivePopup();
    }

    public static removePopwinCache(node: HTMLElement): boolean {
        const popupInfo = IntelligentLayout.getActivePopupInfo();
        if (!popupInfo || !popupInfo.root_node) {
            return false;
        }

        if (node.contains(popupInfo.root_node)) {
            Log.info(`弹窗消失: ${popupInfo.root_node}`, IntelligentLayout.TAG);

            PopupStateManager.clearState(popupInfo.root_node);
            IntelligentLayout.clearActivePopup();
            return true;
        }

        return false;
    }

    static calculateForPopWin(popupInfo: PopupInfo): void {
        Log.d(`calculate for popWindow ${popupInfo?.root_node?.className}`, IntelligentLayout.TAG);
        
        //  步骤1：检查弹窗状态机 - 是否可以开始布局
        if (!PopupStateManager.canStartLayout(popupInfo.root_node)) {
            PopupStateManager.printState(popupInfo.root_node, '跳过布局 - 弹窗正在处理中');
            return;
        }
        
        //  步骤2：设置为布局中状态
        PopupStateManager.setState(popupInfo.root_node, PopupLayoutState.LAYOUTING, '开始布局');
        
        const cachedInfo = IntelligentLayout.getActivePopupInfo();

        if (cachedInfo && cachedInfo !== popupInfo) {
            IntelligentLayout.recoverPopwinStyle();
        }

        let component = IntelligentLayout.getActivePopupComponent();
        if (!component || IntelligentLayout.getActivePopupInfo() !== popupInfo) {
            component = new PopupWindowRelayout(popupInfo);
            IntelligentLayout.cachePopup(popupInfo, component);
        }

        if (component && component.isDirty()) {
            try {
                component.intelligenceLayout();
                // 清除标记
                component.setDirty(false);
            } catch (error) {
                //  步骤4：布局失败
                PopupStateManager.setState(popupInfo.root_node, PopupLayoutState.FAILED, `布局失败: ${error}`);
                Log.e(`布局失败: ${error}`, IntelligentLayout.TAG);
            }
        }

        if (component) {
            IntelligentLayout.cachePopup(popupInfo, component);
        }
        // @ts-ignore
        window.popupInfo = popupInfo;
    }

    // 新增节点是某个组件下的节点，标记这个组件为脏，下一次布局的时候，只需要布局这个组件就可以了
    static markDirty(item: HTMLElement): void {
        if(!item || Utils.shouldSkip(item)) {
            return;
        }

        const popupInfo = IntelligentLayout.getActivePopupInfo();
        const component = IntelligentLayout.getActivePopupComponent();

        if (!popupInfo || !component || component.isDirty()) {
            return;
        }

        if (popupInfo.root_node && popupInfo.root_node.contains(item)) {
            component.setDirty(true);
        }
    }

    static resetAllPopWindows(): void {
        Log.d('========== 重置所有弹窗状态并取消异步任务 ==========', IntelligentLayout.TAG);
        const popupInfo = IntelligentLayout.getActivePopupInfo();
        const component = IntelligentLayout.getActivePopupComponent();

        if (!popupInfo || !component) {
            IntelligentLayout.clearActivePopup();
            return;
        }

        Log.d(`处理弹窗: ${popupInfo.root_node?.className}`, IntelligentLayout.TAG);

        if (component instanceof PopupWindowRelayout) {
            component.cancelPendingValidation();
        }

        PopupStateManager.resetState(popupInfo.root_node, '窗口尺寸变化');

        if (component instanceof PopupWindowRelayout) {
            component.restoreStyles();
        }

        component.setDirty(true);

        IntelligentLayout.clearActivePopup();
        
        Log.d('所有弹窗状态重置完成', IntelligentLayout.TAG);
    }

    static reInit(): void {
        IntelligentLayout.recoverPopwinStyle();
        IntelligentLayout.clearActivePopup();
    }
}
