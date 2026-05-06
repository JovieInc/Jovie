import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const cycleTheme = vi.fn();
const signOut = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut }),
}));
vi.mock('@/components/site/theme-toggle/useThemeToggle', () => ({
  useThemeToggle: () => ({ cycleTheme }),
}));

import { useGlobalShortcutActions } from './useGlobalShortcutActions';

function Probe() {
  useGlobalShortcutActions();
  return <div data-testid='probe' />;
}

describe('useGlobalShortcutActions (JOV-1827)', () => {
  it('cycles theme on Alt+T outside inputs', () => {
    cycleTheme.mockClear();
    render(<Probe />);
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
});
