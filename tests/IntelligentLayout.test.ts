import IntelligentLayout from '../src/Framework/IntelligentLayout';
import { PopupWindowDetector } from '../src/Framework/Popup/PopupWindowDetector';
import { PopupWindowRelayout } from '../src/Framework/Popup/PopupWindowRelayout';
import { PopupInfo } from '../src/Framework/Popup/PopupInfo';
import { PopupStateManager } from '../src/Framework/Popup/PopupStateManager';

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

const getDetectorMock = () => PopupWindowDetector.findPopups as jest.Mock;
const getRelayoutMock = () => PopupWindowRelayout as unknown as jest.MockedClass<typeof PopupWindowRelayout>;
const getStateManager = () => PopupStateManager as unknown as {
  canStartLayout: jest.Mock;
  clearState: jest.Mock;
  printState: jest.Mock;
  resetState: jest.Mock;
  setState: jest.Mock;
};

const createPopupInfo = (): PopupInfo => {
  const root = document.createElement('div');
  root.className = 'popup-root';
  return {
    root_node: root,
    mask_node: root,
    content_node: root,
    popup_type: 0,
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
    IntelligentLayout.clearActivePopup();
  });

  it('exposes TAG constant', () => {
    expect(IntelligentLayout.TAG).toBe('IntelligentLayout');
  });

  it('starts with no active popup', () => {
    expect(IntelligentLayout.getActivePopupInfo()).toBeNull();
    expect(IntelligentLayout.getActivePopupComponent()).toBeNull();
  });

  it('calculateForPopWin caches component and clears dirty flag', () => {
    const info = createPopupInfo();

    IntelligentLayout.calculateForPopWin(info);

    const cachedInfo = IntelligentLayout.getActivePopupInfo();
    const cachedComponent = IntelligentLayout.getActivePopupComponent();

    expect(getRelayoutMock()).toHaveBeenCalledWith(info);
    expect(cachedInfo).toBe(info);
    expect(cachedComponent).not.toBeNull();
    expect((cachedComponent as any).isDirty()).toBe(false);
  });

  it('relayoutForPopWin uses cached popup when available', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);

    IntelligentLayout.relayoutForPopWin();

    expect(getDetectorMock()).not.toHaveBeenCalled();
  });

  it('relayoutForPopWin falls back to detector when cache empty', () => {
    const info = createPopupInfo();
    getDetectorMock().mockReturnValue(info);

    IntelligentLayout.relayoutForPopWin();

    expect(getDetectorMock()).toHaveBeenCalled();
    expect(IntelligentLayout.getActivePopupInfo()).toBe(info);
  });

  it('markDirty marks cached component when target is inside popup', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);
    const component = IntelligentLayout.getActivePopupComponent() as any;
    const child = document.createElement('div');
    info.root_node.appendChild(child);

    // calculateForPopWin already cleared dirty flag, so calling markDirty should set it to true
    IntelligentLayout.markDirty(child);

    expect(component.setDirty).toHaveBeenCalledWith(true);
  });

  it('markDirty skips when component already dirty or target outside popup', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);
    const component = IntelligentLayout.getActivePopupComponent() as any;

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
    expect(IntelligentLayout.getActivePopupInfo()).toBeNull();
  });

  it('resetAllPopWindows cancels validation and restores styles', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);
    const component = IntelligentLayout.getActivePopupComponent() as any;

    IntelligentLayout.resetAllPopWindows();

    expect(component.cancelPendingValidation).toHaveBeenCalled();
    expect(getStateManager().resetState).toHaveBeenCalledWith(info.root_node, expect.any(String));
    expect(component.restoreStyles).toHaveBeenCalled();
    expect(component.setDirty).toHaveBeenCalledWith(true);
    expect(IntelligentLayout.getActivePopupInfo()).toBeNull();
  });

  it('recoverPopwinStyle restores styles and clears cache', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);
    const component = IntelligentLayout.getActivePopupComponent() as any;

    IntelligentLayout.recoverPopwinStyle();

    expect(component.cancelPendingValidation).toHaveBeenCalled();
    expect(component.restoreStyles).toHaveBeenCalled();
    expect(getStateManager().resetState).toHaveBeenCalledWith(info.root_node, expect.any(String));
    expect(IntelligentLayout.getActivePopupInfo()).toBeNull();
  });

  it('reInit delegates to recoverPopwinStyle and clears cache', () => {
    const info = createPopupInfo();
    IntelligentLayout.calculateForPopWin(info);

    IntelligentLayout.reInit();

    expect(IntelligentLayout.getActivePopupInfo()).toBeNull();
  });
});
