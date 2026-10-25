import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDemoOptions, DIAL_DEMO_SERVICE_KEYS, DialDemo } from './DialDemo';

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid='lazy-dial' />,
}));

afterEach(() => vi.unstubAllGlobals());

describe('DialDemo', () => {
  it('uses about a dozen real services, Spotify first, all with icons', () => {
    const options = buildDemoOptions();
    expect(options).toHaveLength(DIAL_DEMO_SERVICE_KEYS.length);
    expect(options.length).toBeGreaterThanOrEqual(10);
    expect(options[0]?.id).toBe('spotify');
    expect(options.every(option => option.icon && !option.href)).toBe(true);
  });
  it('holds the dial height with a placeholder until it nears the viewport', () => {
    let notify: (entries: Array<{ isIntersecting: boolean }>) => void =
      () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof notify) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    render(<DialDemo />);
    expect(screen.queryByTestId('lazy-dial')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('dial-demo').firstElementChild?.getAttribute('style')
    ).toContain('14.75rem');
    act(() => notify([{ isIntersecting: true }]));
    expect(screen.getByTestId('lazy-dial')).toBeInTheDocument();
  });
  it('mounts immediately where IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<DialDemo />);
    expect(screen.getByTestId('lazy-dial')).toBeInTheDocument();
  });
});
