import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar, SidebarProvider } from '@/components/organisms/Sidebar';

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

describe('Sidebar hydration stability', () => {
  it('keeps the desktop sidebar subtree in the first mobile render', () => {
    mockMatchMedia(true);

    const { container } = render(
      <SidebarProvider>
        <Sidebar>
          <div data-testid='sidebar-child'>Navigation</div>
        </Sidebar>
        <main id='main-content'>Main content</main>
      </SidebarProvider>
    );

    const desktopSidebar = container.querySelector('[data-variant="sidebar"]');

    expect(desktopSidebar).not.toBeNull();
    expect(desktopSidebar).toHaveClass('max-lg:hidden');
    expect(
      desktopSidebar?.querySelector('[data-testid="sidebar-child"]')
    ).not.toBeNull();
  });
});
