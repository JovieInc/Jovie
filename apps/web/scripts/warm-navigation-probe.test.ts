// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearWarmNavProbe,
  installWarmNavigationProbe,
  type WarmNavigationProbeWindow,
} from './warm-navigation-probe';

const probe = window as WarmNavigationProbeWindow;

function navigationLink() {
  const link = document.createElement('a');
  link.setAttribute('data-navigation-item-id', 'chat');
  return link;
}

afterEach(() => {
  clearWarmNavProbe();
  vi.restoreAllMocks();
});

describe('browser navigation acknowledgment receipt', () => {
  it('retains a cached transition acknowledgment after pending has already disappeared', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1);
    const link = navigationLink();
    installWarmNavigationProbe(link, 'chat');
    now.mockReturnValue(10);
    link.dispatchEvent(new Event('pointerdown'));
    link.setAttribute('data-navigation-pending', 'true');
    link.removeAttribute('data-navigation-pending');
    now.mockReturnValue(14);
    await Promise.resolve();

    expect(link).not.toHaveAttribute('data-navigation-pending');
    expect(probe.__perfWarmNavStart).toBe(10);
    expect(probe.__perfWarmNavAcknowledgedAt).toBe(14);
    // A later read cannot inflate the measured response with transport latency.
    now.mockReturnValue(500);
    expect(probe.__perfWarmNavAcknowledgedAt! - probe.__perfWarmNavStart!).toBe(
      4
    );
  });

  it('records keyboard input and ignores mutations preceding the input', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1);
    const link = navigationLink();
    installWarmNavigationProbe(link, 'chat');
    link.setAttribute('data-navigation-pending', 'true');
    link.removeAttribute('data-navigation-pending');
    now.mockReturnValue(20);
    link.dispatchEvent(new Event('click'));
    await Promise.resolve();
    expect(probe.__perfWarmNavAcknowledgedAt).toBeUndefined();

    now.mockReturnValue(25);
    link.setAttribute('data-navigation-pending', 'true');
    await Promise.resolve();
    expect(probe.__perfWarmNavStart).toBe(20);
    expect(probe.__perfWarmNavAcknowledgedAt).toBe(25);
  });

  it('disconnects the previous attempt and clears its receipt when rearmed', async () => {
    const first = navigationLink();
    installWarmNavigationProbe(first, 'chat');
    first.dispatchEvent(new Event('click'));
    first.setAttribute('data-navigation-pending', 'true');
    await Promise.resolve();
    expect(probe.__perfWarmNavAcknowledgedAt).toEqual(expect.any(Number));

    const second = navigationLink();
    installWarmNavigationProbe(second, 'chat');
    first.dispatchEvent(new Event('pointerdown'));
    expect(probe.__perfWarmNavStart).toBeUndefined();
    expect(probe.__perfWarmNavAcknowledgedAt).toBeUndefined();
    second.dispatchEvent(new Event('click'));
    clearWarmNavProbe();
    second.setAttribute('data-navigation-pending', 'true');
    await Promise.resolve();
    expect(probe.__perfWarmNavAcknowledgedAt).toBeUndefined();
  });

  it('rejects a trigger for a different navigation item', () => {
    expect(() => installWarmNavigationProbe(navigationLink(), 'inbox')).toThrow(
      'wrong navigation item identity'
    );
  });

  it('rejects an acknowledgment left over from an earlier navigation', () => {
    const link = navigationLink();
    link.setAttribute('data-navigation-pending', 'true');
    expect(() => installWarmNavigationProbe(link, 'chat')).toThrow(
      'already pending'
    );
  });

  it('ignores non-acknowledgment mutations and changes delivered before input', async () => {
    const link = navigationLink();
    installWarmNavigationProbe(link, 'chat');
    link.setAttribute('data-navigation-pending', 'false');
    await Promise.resolve();
    expect(probe.__perfWarmNavAcknowledgedAt).toBeUndefined();
    link.dispatchEvent(new Event('click'));
    link.removeAttribute('data-navigation-pending');
    await Promise.resolve();
    expect(probe.__perfWarmNavAcknowledgedAt).toBeUndefined();
  });

  it('keeps the input clock for profile interactions without requiring an acknowledgment', async () => {
    const link = navigationLink();
    installWarmNavigationProbe(link, null);
    link.dispatchEvent(new Event('pointerdown'));
    const start = probe.__perfWarmNavStart;
    link.dispatchEvent(new Event('click'));
    link.setAttribute('data-navigation-pending', 'true');
    await Promise.resolve();
    expect(probe.__perfWarmNavStart).toBe(start);
    expect(start).toEqual(expect.any(Number));
    expect(probe.__perfWarmNavAcknowledgedAt).toBeUndefined();
  });
});
