import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopTitlebar } from '@/components/organisms/DesktopTitlebar';
import { SidebarProvider } from '@/components/organisms/sidebar/context';

const actions = vi.hoisted(() => ({
  back: vi.fn(),
  forward: vi.fn(),
  history: vi.fn(),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => true,
  useDesktopNavigation: () => ({
    canGoBack: true,
    canGoForward: false,
    goBack: actions.back,
    goForward: actions.forward,
  }),
  observeDesktopFullScreen: () => () => undefined,
  showDesktopHistory: actions.history,
}));

function mount(open = true) {
  return render(
    <SidebarProvider defaultOpen={open}>
      <TooltipProvider>
        <DesktopTitlebar />
      </TooltipProvider>
    </SidebarProvider>
  );
}

describe('desktop window controls', () => {
  beforeEach(() => vi.clearAllMocks());
  it('routes back and history to the native owner, and prevents disabled forward navigation', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Go Back' }));
    await user.click(screen.getByRole('button', { name: 'History' }));
    await user.click(screen.getByRole('button', { name: 'Go Forward' }));
    expect(actions.back).toHaveBeenCalledTimes(1);
    expect(actions.history).toHaveBeenCalledTimes(1);
    expect(actions.forward).not.toHaveBeenCalled();
  });
  it('preserves keyboard activation of the expand control when collapsed', async () => {
    const user = userEvent.setup();
    mount(false);
    const expand = screen.getByTestId('electron-sidebar-toggle');
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expand.focus();
    await user.keyboard('{Enter}');
    expect(expand).toHaveAttribute('aria-expanded', 'true');
    expect(expand.closest('[data-electron-drag-region="true"]')).toBeNull();
  });
});
