import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider, useSidebar } from './context';

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => viewport.mobile,
}));

afterEach(() => {
  vi.useRealTimers();
  document.cookie = 'sidebar:state=; path=/; max-age=0';
});

function Controls() {
  const sidebar = useSidebar();
  return (
    <>
      <button
        type='button'
        onClick={sidebar.toggleSidebar}
        data-rail-toggle='left'
        data-mobile-open={sidebar.openMobile}
        data-desktop-open={sidebar.open}
        data-presentation={sidebar.presentation}
      >
        Toggle
      </button>
      <button type='button' onClick={sidebar.pinSidebar}>
        Pin sidebar
      </button>
      <button type='button' onClick={sidebar.closeSidebar}>
        Close sidebar
      </button>
    </>
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
    const control = screen.getByRole('button', { name: 'Toggle' });
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
  it('promotes a hover preview on activation before allowing an explicit close', () => {
    viewport.mobile = false;
    vi.useFakeTimers();
    render(
      <SidebarProvider defaultOpen={false}>
        <Controls />
      </SidebarProvider>
    );
    const control = screen.getByRole('button', { name: 'Toggle' });
    fireEvent.pointerOver(control);
    act(() => vi.advanceTimersByTime(160));
    expect(control).toHaveAttribute('data-presentation', 'floating');
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-presentation', 'floating');
    fireEvent.pointerOut(control);
    act(() => vi.advanceTimersByTime(1000));
    expect(control).toHaveAttribute('data-presentation', 'floating');
    expect(control).toHaveAttribute('data-desktop-open', 'false');
    expect(document.cookie).not.toContain('sidebar:state=true');
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-presentation', 'collapsed');
  });
  it('opens transiently on click and only saves explicit pinning', () => {
    viewport.mobile = false;
    render(
      <SidebarProvider defaultOpen={false}>
        <Controls />
      </SidebarProvider>
    );
    const control = screen.getByRole('button', { name: 'Toggle' });
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-presentation', 'floating');
    expect(control).toHaveAttribute('data-desktop-open', 'false');
    expect(document.cookie).not.toContain('sidebar:state=true');
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(control).toHaveAttribute('data-presentation', 'collapsed');
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('button', { name: 'Pin sidebar' }));
    expect(control).toHaveAttribute('data-presentation', 'pinned');
    expect(document.cookie).toContain('sidebar:state=true');
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-presentation', 'collapsed');
    expect(document.cookie).toContain('sidebar:state=false');
  });
});
