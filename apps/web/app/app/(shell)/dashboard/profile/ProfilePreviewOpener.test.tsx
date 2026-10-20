import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePreviewOpener } from './ProfilePreviewOpener';

const { viewport, panel } = vi.hoisted(() => ({
  viewport: { isDesktop: false },
  panel: {
    isOpen: false,
    isPreview: false,
    isFloating: false,
    isPinned: false,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  },
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: (breakpoint: string) => {
    expect(breakpoint).toBe('lg');
    return viewport.isDesktop;
  },
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => panel,
}));

describe('ProfilePreviewOpener', () => {
  beforeEach(() => {
    viewport.isDesktop = false;
    panel.isOpen = false;
    panel.open.mockClear();
    panel.close.mockClear();
  });

  it('leaves the editor available on fresh phone and tablet entry', () => {
    render(<ProfilePreviewOpener />);
    expect(panel.open).not.toHaveBeenCalled();
    expect(panel.close).toHaveBeenCalledOnce();
  });

  it('automatically opens the nonmodal desktop companion', () => {
    viewport.isDesktop = true;
    render(<ProfilePreviewOpener />);
    expect(panel.open).toHaveBeenCalledOnce();
    expect(panel.close).not.toHaveBeenCalled();
  });

  it('closes the automatic companion before it becomes a mobile modal', () => {
    viewport.isDesktop = true;
    const { rerender } = render(<ProfilePreviewOpener />);
    panel.isOpen = true;
    viewport.isDesktop = false;
    rerender(<ProfilePreviewOpener />);
    expect(panel.close).toHaveBeenCalledOnce();
    viewport.isDesktop = true;
    rerender(<ProfilePreviewOpener />);
    expect(panel.open).toHaveBeenCalledTimes(2);
  });

  it('preserves explicit mobile disclosure and manual desktop dismissal on rerender', () => {
    const { rerender } = render(<ProfilePreviewOpener />);
    panel.isOpen = true;
    rerender(<ProfilePreviewOpener />);
    expect(panel.close).toHaveBeenCalledOnce();
    expect(panel.open).not.toHaveBeenCalled();
    viewport.isDesktop = true;
    rerender(<ProfilePreviewOpener />);
    panel.isOpen = false;
    rerender(<ProfilePreviewOpener />);
    expect(panel.open).toHaveBeenCalledOnce();
  });
});
