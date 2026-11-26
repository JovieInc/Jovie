import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/organisms/sidebar/context';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DesktopReleaseIdentity, DesktopTitlebar } from './DesktopTitlebar';

vi.mock('../../../../packages/ui/atoms/tooltip-shortcut', () => ({
  TooltipShortcut: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

const nav = vi.hoisted(() => ({
  isDesktop: true,
  canGoBack: true,
  canGoForward: false,
  goBack: vi.fn(),
  goForward: vi.fn(),
}));

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  useIsElectronRuntime: () => nav.isDesktop,
  useDesktopBuildIdentity: () => undefined,
  useDesktopNavigation: () => ({
    canGoBack: nav.canGoBack,
    canGoForward: nav.canGoForward,
    goBack: nav.goBack,
    goForward: nav.goForward,
  }),
}));

function renderTitlebar() {
  return render(
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <DesktopTitlebar />
        <DesktopReleaseIdentity />
        <nav id='shell-left-rail' aria-label='Sidebar' />
      </SidebarProvider>
    </TooltipProvider>
  );
}

describe('DesktopTitlebar', () => {
  beforeEach(() => {
    nav.isDesktop = true;
    nav.canGoBack = true;
    nav.canGoForward = false;
    nav.goBack.mockClear();
    nav.goForward.mockClear();
  });

  it('routes the back button to history and disables forward without history', async () => {
    const user = userEvent.setup();
    const { container } = renderTitlebar();

    const back = screen.getByRole('button', { name: 'Go Back' });
    const forward = screen.getByRole('button', { name: 'Go Forward' });
    expect(forward).toBeDisabled();
    await user.click(back);
    expect(nav.goBack).toHaveBeenCalledTimes(1);
    await user.click(forward);
    expect(nav.goForward).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('routes the forward button once history allows it', async () => {
    const user = userEvent.setup();
    nav.canGoForward = true;
    renderTitlebar();

    await user.click(screen.getByRole('button', { name: 'Go Forward' }));
    expect(nav.goForward).toHaveBeenCalledTimes(1);
  });

  it('labels an unverified build and has no axe violations', async () => {
    const { container } = renderTitlebar();

    const identity = screen.getByRole('status');
    expect(identity).toHaveAttribute('data-provenance', 'unverified');
    expect(identity).toHaveTextContent(
      'Desktop · Version Unknown · Unverified'
    );
    await expectNoA11yViolations(container);
  });

  it('renders no controls or identity outside Electron', async () => {
    nav.isDesktop = false;
    const { container } = renderTitlebar();

    expect(screen.queryByRole('button', { name: 'Go Back' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
