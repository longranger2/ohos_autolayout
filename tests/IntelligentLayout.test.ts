import IntelligentLayout from '../src/Framework/IntelligentLayout';
import { PopupWindowDetector } from '../src/Framework/Popup/PopupWindowDetector';
import { PopupWindowRelayout } from '../src/Framework/Popup/PopupWindowRelayout';
import { PopupInfo } from '../src/Framework/Popup/PopupInfo';
import { PopupType } from '../src/Framework/Popup/PopupType';
import { PopupStateManager } from '../src/Framework/Popup/PopupStateManager';

type MockStateManager = {
  canStartLayout: jest.Mock;
  clearState: jest.Mock;
  printState: jest.Mock;
  resetState: jest.Mock;
  setState: jest.Mock;
};

jest.mock('../src/Debug/Log', () => ({
  __esModule: true,
  default: {
    d: jest.fn(),
    e: jest.fn(),
    info: jest.fn(),
    w: jest.fn(),
  },
}));

jest.mock('../src/Debug/Tag', () => ({
  __esModule: true,
  default: {
    intelligentLayout: 'IntelligentLayout',
  },
}));

jest.mock('../src/Framework/Utils/Utils', () => ({
  __esModule: true,
  default: {
    shouldSkip: jest.fn(() => false),
  },
}));

jest.mock('../src/Framework/Popup/PopupWindowDetector', () => ({
  PopupWindowDetector: {
    findPopups: jest.fn(),
  },
}));

jest.mock('../src/Framework/Popup/PopupWindowRelayout', () => {
  const PopupWindowRelayoutMock = jest.fn().mockImplementation(function () {
    let dirty = true;
    this.isDirty = jest.fn(() => dirty);
    this.intelligenceLayout = jest.fn();
    this.setDirty = jest.fn((value: boolean) => {
      dirty = value;
    });
    this.restoreStyles = jest.fn();
    this.cancelPendingValidation = jest.fn();
  });
  return { PopupWindowRelayout: PopupWindowRelayoutMock };
});

jest.mock('../src/Framework/Popup/PopupStateManager', () => ({
  PopupStateManager: {
    canStartLayout: jest.fn(() => true),
    clearState: jest.fn(),
    printState: jest.fn(),
    resetState: jest.fn(),
    setState: jest.fn(() => true),
  },
}));

const getDetectorMock = (): jest.Mock => PopupWindowDetector.findPopups as jest.Mock;
const getRelayoutMock = (): jest.MockedClass<typeof PopupWindowRelayout> => PopupWindowRelayout as unknown as jest.MockedClass<typeof PopupWindowRelayout>;
const getStateManager = (): MockStateManager => PopupStateManager as unknown as MockStateManager;

const createPopupInfo = (): PopupInfo => {
  const root = document.createElement('div');
  root.className = 'popup-root';
  return {
    root_node: root,
    mask_node: root,
    content_node: root,
    popup_type: PopupType.A,
    root_position: 'fixed',
    root_zindex: 1000,
    has_mask: true,
    root_screen_area_ratio: 1,
    root_is_visiable: true,
    has_close_button: true,
    mask_area_ratio: 1,
    mask_position: 'fixed',
    mask_zindex: 1000,
    stickyTop_height: 0,
    stickyBottom_height: 0,
  };
};

describe('IntelligentLayout (single popup cache)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    IntelligentLayout.clearActivePopupWindow();
  });

  it('exposes TAG constant', () => {
    expect(IntelligentLayout.TAG).toBe('IntelligentLayout');
  });

  it('starts with no active popup', () => {
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBeNull();
    expect(IntelligentLayout.getActivePopupWindowComponent()).toBeNull();
  });

  it('calculateForPopWin caches component and clears dirty flag', () => {
    const info = createPopupInfo();

    IntelligentLayout.calculateForPopWin(info);

    const cachedInfo = IntelligentLayout.getActivePopupWindowInfo();
    const cachedComponent = IntelligentLayout.getActivePopupWindowComponent();

    expect(getRelayoutMock()).toHaveBeenCalledWith(info);
    expect(cachedInfo).toBe(info);
    expect(cachedComponent).not.toBeNull();
    expect((cachedComponent).isDirty()).toBe(false);
  });
;

  it('markDirty marks cached component when target is inside popup', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);
    const component = IntelligentLayout.getActivePopupWindowComponent();
    const child = document.createElement('div');
    info.root_node.appendChild(child);

    // calculateForPopWin already cleared dirty flag, so calling markDirty should set it to true
    IntelligentLayout.markDirty(child);

    expect(component.setDirty).toHaveBeenCalledWith(true);
  });

  it('markDirty skips when component already dirty or target outside popup', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);
    const component = IntelligentLayout.getActivePopupWindowComponent();

    // Make component report dirty
    component.setDirty(true);

    IntelligentLayout.markDirty(document.body);

    expect(component.setDirty).toHaveBeenLastCalledWith(true);
  });

  it('removePopwinCache clears active popup and state when node contains root', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);

    const parent = document.createElement('div');
    parent.appendChild(info.root_node);

    const removed = IntelligentLayout.removePopwinCache(parent);

    expect(removed).toBe(true);
    expect(getStateManager().clearState).toHaveBeenCalledWith(info.root_node);
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBeNull();
  });

  it('resetAllPopWindows cancels validation and restores styles', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);
    const component = IntelligentLayout.getActivePopupWindowComponent() as PopupWindowRelayout;

    IntelligentLayout.resetPopWindows('初始化');

    expect(component.cancelPendingValidation).toHaveBeenCalled();
    expect(getStateManager().resetState).toHaveBeenCalledWith(info.root_node, expect.any(String));
    expect(component.restoreStyles).toHaveBeenCalled();
    expect(component.setDirty).toHaveBeenCalledWith(true);
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBeNull();
  });

  it('reInit delegates to recoverPopwinStyle and clears cache', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);

    IntelligentLayout.reInit('初始化');

    expect(IntelligentLayout.getActivePopupWindowInfo()).toBeNull();
  });

  it('intelligentLayout switches to new popup when a different popup appears', () => {
    const root = document.createElement('div');
    
    // 创建弹窗A
    const popupA = createPopupInfo();
    popupA.root_node.className = 'popup-a';
    
    // 创建弹窗B
    const popupB = createPopupInfo();
    popupB.root_node.className = 'popup-b';
    
    // 第一次调用：检测到弹窗A并缓存
    getDetectorMock().mockReturnValueOnce(popupA);
    IntelligentLayout.intelligentLayout(root);
    
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBe(popupA);
    const componentA = IntelligentLayout.getActivePopupWindowComponent() as PopupWindowRelayout;
    expect(componentA).not.toBeNull();
    
    // 第二次调用：弹窗A还在，但检测到弹窗B（更高层级）
    getDetectorMock().mockReturnValueOnce(popupB);
    IntelligentLayout.intelligentLayout(root);
    
    // 验证切换逻辑
    expect(componentA.cancelPendingValidation).toHaveBeenCalled();
    expect(componentA.restoreStyles).toHaveBeenCalled();
    expect(getStateManager().resetState).toHaveBeenCalledWith(popupA.root_node, '检测到新弹窗');
    
    // 验证现在缓存的是弹窗B
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBe(popupB);
    const componentB = IntelligentLayout.getActivePopupWindowComponent() as PopupWindowRelayout;
    expect(componentB).not.toBe(componentA);
  });

  it('intelligentLayout continues using cached popup when no new popup detected', () => {
    const root = document.createElement('div');
    const popupA = createPopupInfo();
    popupA.root_node.className = 'popup-a';
    
    // 第一次：检测到弹窗A
    getDetectorMock().mockReturnValueOnce(popupA);
    IntelligentLayout.intelligentLayout(root);
    
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBe(popupA);
    const componentA = IntelligentLayout.getActivePopupWindowComponent();
    
    // 第二次：没有检测到新弹窗，应继续使用缓存的弹窗A
    getDetectorMock().mockReturnValueOnce(null);
    IntelligentLayout.intelligentLayout(root);
    
    // 验证仍然使用弹窗A
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBe(popupA);
    expect(IntelligentLayout.getActivePopupWindowComponent()).toBe(componentA);
  });

  it('intelligentLayout uses new popup when no cached popup exists', () => {
    const root = document.createElement('div');
    const popupA = createPopupInfo();
    
    // 没有缓存时检测到弹窗A
    getDetectorMock().mockReturnValueOnce(popupA);
    IntelligentLayout.intelligentLayout(root);
    
    // 应该缓存弹窗A
    expect(IntelligentLayout.getActivePopupWindowInfo()).toBe(popupA);
    expect(IntelligentLayout.getActivePopupWindowComponent()).not.toBeNull();
  });
});