import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider, useSidebar } from './context';

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => viewport.mobile,
}));

afterEach(() => {
  document.cookie = 'sidebar:state=; path=/; max-age=0';
});

function Controls() {
  const sidebar = useSidebar();
  return (
    <button
      type='button'
      onClick={sidebar.toggleSidebar}
      data-mobile-open={sidebar.openMobile}
      data-desktop-open={sidebar.open}
    >
      Toggle
    </button>
  );
}

describe('sidebar resize state', () => {
  it('dismisses the mobile sheet on desktop resize without changing pinned desktop intent', () => {
    viewport.mobile = true;
    const { rerender } = render(
      <SidebarProvider defaultOpen={false}>
        <Controls />
      </SidebarProvider>
    );
    const control = screen.getByRole('button');
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-mobile-open', 'true');
    viewport.mobile = false;
    rerender(
      <SidebarProvider defaultOpen={false}>
        <Controls />
      </SidebarProvider>
    );
    expect(control).toHaveAttribute('data-mobile-open', 'false');
    expect(control).toHaveAttribute('data-desktop-open', 'false');
    viewport.mobile = true;
    rerender(
      <SidebarProvider defaultOpen={false}>
        <Controls />
      </SidebarProvider>
    );
    expect(control).toHaveAttribute('data-mobile-open', 'false');
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-mobile-open', 'true');
  });
});
