import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Sidebar,
  SidebarProvider,
  useSidebar,
} from '@/components/organisms/sidebar';

const originalMatchMedia = globalThis.matchMedia;

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

function DrawerControls() {
  const { setOpenMobile } = useSidebar();
  return (
    <button type='button' onClick={() => setOpenMobile(true)}>
      Open navigation
    </button>
  );
}
function Navigation() {
  const { setOpenMobile } = useSidebar();
  return (
    <>
      <button type='button' data-testid='sidebar-child'>
        Navigation
      </button>
      <button type='button' onClick={() => setOpenMobile(false)}>
        Close navigation
      </button>
    </>
  );
}
function Shell() {
  return (
    <SidebarProvider>
      <Sidebar>
        <Navigation />
      </Sidebar>
      <DrawerControls />
      <main id='main-content'>Main content</main>
    </SidebarProvider>
  );
}

describe('Sidebar hydration stability', () => {
  it('hydrates the desktop server subtree on mobile without an error or duplicate interactive navigation', async () => {
    mockMatchMedia(true);
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Shell />);
    document.body.append(container);
    const desktopSidebar = container.querySelector('[data-variant="sidebar"]');
    expect(desktopSidebar).not.toBeNull();
    expect(desktopSidebar).toHaveClass('max-lg:hidden');
    expect(
      desktopSidebar?.querySelector('[data-testid="sidebar-child"]')
    ).not.toBeNull();
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Shell />, { onRecoverableError });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(desktopSidebar).toHaveAttribute('inert');
      expect(
        screen.queryByRole('button', { name: 'Navigation' })
      ).not.toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Open navigation' }));
      expect(
        screen.getAllByRole('button', { name: 'Navigation' })
      ).toHaveLength(1);
      await user.click(
        screen.getByRole('button', { name: 'Close navigation' })
      );
      expect(
        screen.queryByRole('button', { name: 'Navigation' })
      ).not.toBeInTheDocument();
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
