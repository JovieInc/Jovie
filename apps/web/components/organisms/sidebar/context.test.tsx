import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SHELL_RAIL_PREVIEW_GRACE_MS,
  SHELL_RAIL_PREVIEW_INTENT_MS,
} from '@/components/shell/rail-motion';
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

describe('flyout state machine', () => {
  function Flyout() {
    const sidebar = useSidebar();
    return (
      <>
        <button type='button' data-testid='outside'>
          Outside
        </button>
        <div data-rail-preview-region='left' data-testid='rail'>
          <button
            type='button'
            data-testid='pin'
            onClick={sidebar.toggleSidebar}
            data-rail-toggle='left'
          >
            Pin
          </button>
          <output
            data-testid='state'
            data-state={sidebar.state}
            data-preview={String(sidebar.isPreview)}
            data-floating={String(sidebar.isFloating)}
            data-pinned={String(sidebar.open)}
          />
        </div>
      </>
    );
  }
  const read = () => screen.getByTestId('state').dataset;
  const enterRail = (pointerType = 'mouse') =>
    fireEvent.pointerOver(screen.getByTestId('rail'), { pointerType });
  const leaveRail = () =>
    fireEvent.pointerOut(screen.getByTestId('rail'), {
      relatedTarget: screen.getByTestId('outside'),
    });
  const mount = () => {
    viewport.mobile = false;
    vi.useFakeTimers();
    return render(
      <SidebarProvider defaultOpen={false}>
        <Flyout />
      </SidebarProvider>
    );
  };
  afterEach(() => vi.useRealTimers());

  it('waits for hover intent before peeking, and a pass-through never opens it', () => {
    mount();
    enterRail();
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS - 20));
    expect(read().preview).toBe('false');
    leaveRail();
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS * 3));
    expect(read().preview).toBe('false');
    expect(read().state).toBe('closed');

    enterRail();
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS + 1));
    expect(read()).toMatchObject({
      state: 'open',
      preview: 'true',
      floating: 'true',
      pinned: 'false',
    });
  });

  it('closes the peek after the leave grace, and Escape closes it at once', () => {
    mount();
    enterRail();
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS + 1));
    leaveRail();
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS - 20));
    expect(read().preview).toBe('true');
    act(() => vi.advanceTimersByTime(40));
    expect(read().preview).toBe('false');

    enterRail();
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS + 1));
    expect(read().preview).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(read()).toMatchObject({ preview: 'false', state: 'closed' });
  });

  it('never peeks on touch, so opening does not depend on hover', () => {
    mount();
    enterRail('touch');
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS * 3));
    expect(read().preview).toBe('false');
    fireEvent.click(screen.getByTestId('pin'));
    expect(read()).toMatchObject({ state: 'open', pinned: 'true' });
  });

  it('pins from a peek, stops floating, and unpin returns to the rail', () => {
    mount();
    enterRail();
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS + 1));
    expect(document.cookie).not.toContain('sidebar:state=true');
    fireEvent.click(screen.getByTestId('pin'));
    expect(read()).toMatchObject({
      state: 'open',
      pinned: 'true',
      preview: 'false',
      floating: 'false',
    });
    expect(document.cookie).toContain('sidebar:state=true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(read().pinned).toBe('true');

    fireEvent.click(screen.getByTestId('pin'));
    expect(read()).toMatchObject({ state: 'closed', pinned: 'false' });
    expect(document.cookie).toContain('sidebar:state=false');
    // The pointer is still on the rail: the explicit close is not re-peeked.
    act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_INTENT_MS * 3));
    expect(read().preview).toBe('false');
  });

  it('opens a peek on keyboard focus without a dwell', () => {
    mount();
    act(() => screen.getByTestId('pin').focus());
    expect(read()).toMatchObject({ preview: 'true', state: 'open' });
  });
});

describe('explicit sidebar activation', () => {
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
    // Keyboard focus on the rail is equivalent access: it peeks, unpinned.
    expect(control).toHaveAttribute('data-preview', 'true');
    expect(control).toHaveAttribute('data-desktop-open', 'false');
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
