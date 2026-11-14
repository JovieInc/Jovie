import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarContext, type SidebarContextValue } from './SidebarContext';
import {
  SIDEBAR_HEADER_ICON_BUTTON_CLASS,
  SIDEBAR_HEADER_ICON_CLASS,
} from './sidebar-header-icon-button';

vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

const electron = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  useIsElectronRuntime: () => electron.value,
}));

import { SidebarHeaderActions } from './SidebarHeaderActions';

function sidebar(
  overrides: Partial<SidebarContextValue> = {}
): SidebarContextValue {
  return {
    state: 'open',
    open: true,
    isPreview: false,
    isFloating: false,
    setOpen: vi.fn(),
    openMobile: false,
    setOpenMobile: vi.fn(),
    isMobile: false,
    toggleSidebar: vi.fn(),
    ...overrides,
  };
}

function renderActions(
  props: Partial<Parameters<typeof SidebarHeaderActions>[0]> = {},
  context: Partial<SidebarContextValue> = {},
  wrap: (node: ReactNode) => ReactNode = node => node
) {
  return render(
    <HeaderActionsProvider>
      <TooltipProvider>
        <SidebarContext.Provider value={sidebar(context)}>
          <nav id='shell-left-rail' aria-label='Sidebar' />
          {wrap(
            <SidebarHeaderActions
              showActions
              headerOwnsCollapsedToggle
              inboxNavigation={{ state: 'available', pendingCount: 2 }}
              {...props}
            />
          )}
        </SidebarContext.Provider>
      </TooltipProvider>
    </HeaderActionsProvider>
  );
}

describe('SidebarHeaderActions', () => {
  it('renders bell, search and rail toggle on one icon-button contract', async () => {
    const { container } = renderActions();
    const bell = screen.getByRole('link', { name: /^Inbox — / });
    const search = screen.getByRole('button', { name: 'Search Jovie' });
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    for (const control of [bell, search, toggle]) {
      for (const token of SIDEBAR_HEADER_ICON_BUTTON_CLASS.split(' ')) {
        expect(control).toHaveClass(token);
      }
      for (const token of SIDEBAR_HEADER_ICON_CLASS.split(' ')) {
        expect(control.querySelector('svg')).toHaveClass(token);
      }
    }
    // The unread dot stays on the bell.
    expect(bell).toHaveAttribute('data-inbox-attention', 'available');
    await expectNoA11yViolations(container);
  });

  it('keeps every control reachable by keyboard in order', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.tab();
    expect(screen.getByRole('link', { name: /^Inbox — / })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Search Jovie' })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toHaveFocus();
  });

  it('stages bell and search out of AX navigation when the rail collapses', () => {
    renderActions({}, { state: 'closed', open: false });
    const actions = document.querySelector('[data-sidebar-header-actions]');
    expect(actions).toHaveAttribute('inert');
    expect(actions).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows only the toggle on route, operator and demo rails', () => {
    renderActions({ showActions: false });
    expect(document.querySelector('[data-sidebar-header-actions]')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
  });

  it('leaves the toggle to the desktop titlebar in Electron', () => {
    electron.value = true;
    try {
      renderActions();
      expect(
        document.querySelector('[data-sidebar-header-toggle-slot]')
      ).toBeNull();
    } finally {
      electron.value = false;
    }
  });
});
