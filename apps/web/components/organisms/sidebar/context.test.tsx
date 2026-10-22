import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      data-rail-toggle='left'
      data-preview={sidebar.isPreview}
      data-state={sidebar.state}
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

describe('explicit sidebar activation', () => {
  it('keeps the collapsed rail closed through approach and hover until clicked', () => {
    viewport.mobile = false;
    render(
      <SidebarProvider defaultOpen={false}>
        <div data-rail-preview-region='left'>
          <Controls />
        </div>
      </SidebarProvider>
    );
    const control = screen.getByRole('button');
    fireEvent.pointerOver(control.parentElement!);
    fireEvent.pointerOver(control);
    act(() => control.focus());
    expect(control).toHaveAttribute('data-state', 'closed');
    expect(control).toHaveAttribute('data-preview', 'false');
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-desktop-open', 'true');
    expect(control).toHaveAttribute('data-state', 'open');
    fireEvent.pointerOut(control);
    expect(control).toHaveAttribute('data-desktop-open', 'true');
    fireEvent.click(control);
    fireEvent.pointerOver(control);
    expect(control).toHaveAttribute('data-state', 'closed');
  });

  it('opens and closes with Enter, Space, and the sidebar shortcut', async () => {
    viewport.mobile = false;
    const user = userEvent.setup();
    render(
      <SidebarProvider defaultOpen={false}>
        <Controls />
      </SidebarProvider>
    );
    const control = screen.getByRole('button');
    await user.tab();
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute('data-state', 'closed');
    await user.keyboard('{Enter}');
    expect(control).toHaveAttribute('data-desktop-open', 'true');
    await user.keyboard(' ');
    expect(control).toHaveAttribute('data-desktop-open', 'false');
    await user.keyboard('[[');
    expect(control).toHaveAttribute('data-desktop-open', 'true');
  });

  it('uses touch activation for the mobile drawer without changing the desktop pin', () => {
    viewport.mobile = true;
    render(
      <SidebarProvider defaultOpen={false}>
        <Controls />
      </SidebarProvider>
    );
    const control = screen.getByRole('button');
    fireEvent.pointerOver(control, { pointerType: 'touch' });
    expect(control).toHaveAttribute('data-mobile-open', 'false');
    fireEvent.pointerDown(control, { pointerType: 'touch' });
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-mobile-open', 'true');
    expect(control).toHaveAttribute('data-desktop-open', 'false');
    fireEvent.click(control);
    expect(control).toHaveAttribute('data-mobile-open', 'false');
  });
});
