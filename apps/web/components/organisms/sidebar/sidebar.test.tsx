import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './sidebar';

const sidebarContext = vi.hoisted(() => ({
  value: {
    isMobile: false,
    state: 'open' as 'open' | 'closed',
    openMobile: false,
    setOpenMobile: vi.fn(),
    isPreview: false,
    isFloating: false,
    open: true,
  },
}));

vi.mock('./context', () => ({
  useSidebar: () => sidebarContext.value,
}));

vi.mock('@/components/shell/useRailMotionPhase', () => ({
  useRailMotionPhase: () => 'settled',
}));

vi.mock('@jovie/ui', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({
    children,
    hideClose: _hideClose,
    side: _side,
    ...props
  }: {
    children: ReactNode;
    hideClose?: boolean;
    side?: string;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
}));

function renderSidebar(
  overrides: Partial<typeof sidebarContext.value> = {},
  props: React.ComponentProps<typeof Sidebar> = {}
) {
  Object.assign(sidebarContext.value, overrides);
  return render(
    <Sidebar {...props}>
      <nav>Sidebar nav</nav>
    </Sidebar>
  );
}

describe('Sidebar rail chrome', () => {
  beforeEach(() => {
    Object.assign(sidebarContext.value, {
      isMobile: false,
      state: 'open',
      openMobile: false,
      isPreview: false,
      isFloating: false,
      open: true,
    });
  });

  it('exposes a stable rail id and pinned allocation while open', () => {
    const { container } = renderSidebar();

    const rail = container.querySelector('#shell-left-rail');
    expect(rail).not.toBeNull();
    expect(rail).toHaveAttribute('data-rail-preview-region', 'left');
    expect(rail).toHaveAttribute('data-rail-pinned', 'true');
    expect(rail).not.toHaveAttribute('data-rail-preview');
    expect(rail).not.toHaveAttribute('aria-hidden');
    expect(rail).not.toHaveAttribute('inert');
  });

  it('leaves keyboard and AX navigation when closed offcanvas', () => {
    const { container } = renderSidebar({ state: 'closed', open: false });

    const rail = container.querySelector('#shell-left-rail');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(rail).toHaveAttribute('inert');
    expect(rail).toHaveAttribute('data-collapsible', 'offcanvas');
  });

  it('keeps the icon rail reachable when collapsed to icons', () => {
    const { container } = renderSidebar(
      { state: 'closed', open: false },
      { collapsible: 'icon' }
    );

    const rail = container.querySelector('#shell-left-rail');
    expect(rail).not.toHaveAttribute('aria-hidden');
    expect(rail).not.toHaveAttribute('inert');
    expect(rail).toHaveStyle({ width: '52px' });
  });

  it('marks previewed and floating rails without pinning them', () => {
    const { container } = renderSidebar({
      state: 'open',
      open: false,
      isPreview: true,
      isFloating: true,
    });

    const rail = container.querySelector('#shell-left-rail');
    expect(rail).toHaveAttribute('data-rail-preview', 'true');
    expect(rail).toHaveAttribute('data-rail-pinned', 'false');
    expect(rail?.querySelector('.absolute')).not.toBeNull();
  });

  it('moves the rail id onto the mobile sheet instead of the desktop peer', () => {
    const { container } = renderSidebar({ isMobile: true, openMobile: true });

    const sheet = container.querySelector('[data-mobile="true"]');
    expect(sheet).toHaveAttribute('id', 'shell-left-rail');
    // The hidden desktop peer must not also claim the landmark.
    expect(container.querySelectorAll('#shell-left-rail')).toHaveLength(1);
  });
});
