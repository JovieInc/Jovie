import { TooltipProvider } from '@jovie/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/organisms/sidebar/context';
import { DesktopTitlebar } from './DesktopTitlebar';

// Tooltip timing is unrelated to the toolbar's shared state action.
vi.mock('../../../../packages/ui/atoms/tooltip-shortcut', () => ({
  TooltipShortcut: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));
vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  useIsElectronRuntime: () => true,
  useDesktopNavigation: () => ({
    canGoBack: false,
    canGoForward: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
  }),
}));

afterEach(() => {
  document.cookie = 'sidebar:state=; path=/; max-age=0';
  Reflect.deleteProperty(window, 'electronAPI');
});

describe('Mac sidebar activation', () => {
  it('shares reversible state across toolbar clicks, Cmd+B, and the native View menu', () => {
    const unsubscribe = vi.fn();
    let menuToggle = () => {};
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        onToggleSidebar: (callback: () => void) => {
          menuToggle = callback;
          return unsubscribe;
        },
      },
    });
    const { unmount } = render(
      <TooltipProvider>
        <SidebarProvider defaultOpen={true}>
          <DesktopTitlebar />
          <input aria-label='Draft' defaultValue='Keep this draft' />
        </SidebarProvider>
      </TooltipProvider>
    );
    const toggle = screen.getByTestId('electron-sidebar-toggle');
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.cookie).toContain('sidebar:state=false');
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    act(() => menuToggle());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const draft = screen.getByRole('textbox', { name: 'Draft' });
    act(() => draft.focus());
    act(() => menuToggle());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(draft).toHaveFocus();
    expect(draft).toHaveValue('Keep this draft');
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
