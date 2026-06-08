import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RightRailKeyboardHandler } from '@/hooks/RightRailKeyboardHandler';

const mockTogglePreviewPanel = vi.fn();
const mockTableToggle = vi.fn();
const tableToggleRef = { current: null as (() => void) | null };

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    toggle: mockTogglePreviewPanel,
    isOpen: true,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@/contexts/TableMetaContext', () => ({
  useTableMeta: () => ({
    tableMeta: {
      rowCount: null,
      toggle: tableToggleRef.current,
      rightPanelWidth: null,
    },
    setTableMeta: vi.fn(),
  }),
}));

describe('RightRailKeyboardHandler', () => {
  beforeEach(() => {
    mockTogglePreviewPanel.mockReset();
    mockTableToggle.mockReset();
    tableToggleRef.current = null;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function dispatchRightBracket() {
    const event = new KeyboardEvent('keydown', {
      key: ']',
      bubbles: true,
    });
    globalThis.dispatchEvent(event);
  }

  it('toggles the preview panel when no table drawer toggle is registered', () => {
    render(<RightRailKeyboardHandler />);

    act(() => {
      dispatchRightBracket();
    });

    expect(mockTogglePreviewPanel).toHaveBeenCalledOnce();
    expect(mockTableToggle).not.toHaveBeenCalled();
  });

  it('prefers the table drawer toggle when one is registered', () => {
    tableToggleRef.current = mockTableToggle;

    render(<RightRailKeyboardHandler />);

    act(() => {
      dispatchRightBracket();
    });

    expect(mockTableToggle).toHaveBeenCalledOnce();
    expect(mockTogglePreviewPanel).not.toHaveBeenCalled();
  });
});
