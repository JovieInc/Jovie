import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';

const cycleTheme = vi.fn();
const signOut = vi.fn();
const push = vi.fn();
const shortcutState = vi.hoisted(() => ({
  isAdmin: true,
  pathname: '/app',
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut }),
}));
vi.mock('@/components/site/theme-toggle/useThemeToggle', () => ({
  useThemeToggle: () => ({ cycleTheme }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => shortcutState.pathname,
  useRouter: () => ({ push }),
}));

import { useGlobalShortcutActions } from './useGlobalShortcutActions';

function ShortcutProbe() {
  useGlobalShortcutActions();
  return <div data-testid='probe' />;
}

function Probe({ withProvider = true }: { readonly withProvider?: boolean }) {
  const node = <ShortcutProbe />;
  if (!withProvider) return node;
  return (
    <DashboardDataContext.Provider
      value={
        {
          isAdmin: shortcutState.isAdmin,
        } as DashboardData
      }
    >
      {node}
    </DashboardDataContext.Provider>
  );
}

describe('useGlobalShortcutActions (JOV-1827)', () => {
  it('cycles theme on Alt+T outside inputs', () => {
    cycleTheme.mockClear();
    render(<Probe withProvider={false} />);
    fireEvent.keyDown(window, { key: 't', altKey: true });
    expect(cycleTheme).toHaveBeenCalledTimes(1);
  });

  it('does not fire Alt+T while typing in an input', () => {
    cycleTheme.mockClear();
    const { container } = render(
      <>
        <input data-testid='in' />
        <Probe />
      </>
    );
    const input = container.querySelector('input')!;
    input.focus();
    fireEvent.keyDown(input, { key: 't', altKey: true });
    expect(cycleTheme).not.toHaveBeenCalled();
  });

  it('signs out on Alt+Shift+Q with redirectUrl=/', () => {
    signOut.mockClear();
    render(<Probe />);
    fireEvent.keyDown(window, { key: 'q', altKey: true, shiftKey: true });
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/' });
  });

  it('ignores plain T (no modifier)', () => {
    cycleTheme.mockClear();
    render(<Probe />);
    fireEvent.keyDown(window, { key: 't' });
    expect(cycleTheme).not.toHaveBeenCalled();
  });

  it('ignores Cmd+T (browser-reserved)', () => {
    cycleTheme.mockClear();
    render(<Probe />);
    fireEvent.keyDown(window, { key: 't', metaKey: true });
    expect(cycleTheme).not.toHaveBeenCalled();
  });

  it('switches an admin from Jovie to OV on Alt+Shift+W', () => {
    shortcutState.isAdmin = true;
    shortcutState.pathname = '/app/tasks';
    push.mockClear();
    render(<Probe />);

    fireEvent.keyDown(window, {
      key: 'w',
      altKey: true,
      shiftKey: true,
    });

    expect(push).toHaveBeenCalledWith('/app/ov');
  });

  it('switches an admin from OV back to Jovie', () => {
    shortcutState.isAdmin = true;
    shortcutState.pathname = '/app/ov/ops';
    push.mockClear();
    render(<Probe />);

    fireEvent.keyDown(window, {
      key: 'w',
      altKey: true,
      shiftKey: true,
    });

    expect(push).toHaveBeenCalledWith('/app');
  });

  it('uses the physical W key when Option changes the macOS key value', () => {
    shortcutState.isAdmin = true;
    shortcutState.pathname = '/app';
    push.mockClear();
    render(<Probe />);

    fireEvent.keyDown(window, {
      key: '„',
      code: 'KeyW',
      altKey: true,
      shiftKey: true,
    });

    expect(push).toHaveBeenCalledWith('/app/ov');
  });

  it('does not expose workspace switching to non-admins', () => {
    shortcutState.isAdmin = false;
    shortcutState.pathname = '/app';
    push.mockClear();
    render(<Probe />);

    fireEvent.keyDown(window, {
      key: 'w',
      altKey: true,
      shiftKey: true,
    });

    expect(push).not.toHaveBeenCalled();
  });

  it('does not switch workspaces while typing or composing', () => {
    shortcutState.isAdmin = true;
    shortcutState.pathname = '/app';
    push.mockClear();
    const { container } = render(
      <>
        <input />
        <Probe />
      </>
    );

    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, {
      key: 'w',
      code: 'KeyW',
      altKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(window, {
      key: 'w',
      code: 'KeyW',
      altKey: true,
      shiftKey: true,
      isComposing: true,
    });

    expect(push).not.toHaveBeenCalled();
  });

  it('does not switch workspaces with conflicting command modifiers', () => {
    shortcutState.isAdmin = true;
    shortcutState.pathname = '/app';
    push.mockClear();
    render(<Probe />);

    fireEvent.keyDown(window, {
      key: 'w',
      code: 'KeyW',
      altKey: true,
      shiftKey: true,
      metaKey: true,
    });
    fireEvent.keyDown(window, {
      key: 'w',
      code: 'KeyW',
      altKey: true,
      shiftKey: true,
      ctrlKey: true,
    });

    expect(push).not.toHaveBeenCalled();
  });

  it('fails closed when the dashboard provider is absent', () => {
    shortcutState.isAdmin = false;
    push.mockClear();
    render(<Probe withProvider={false} />);

    fireEvent.keyDown(window, {
      key: 'w',
      altKey: true,
      shiftKey: true,
    });

    expect(push).not.toHaveBeenCalled();
  });
});
