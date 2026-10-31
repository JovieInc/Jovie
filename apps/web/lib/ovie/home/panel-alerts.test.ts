import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureError = vi.fn(async () => undefined);
vi.mock('@/lib/error-tracking', () => ({ captureError }));

const { reportOvieHomePanelError, resetOvieHomePanelAlertsForTests } =
  await import('./panel-alerts');

describe('reportOvieHomePanelError', () => {
  beforeEach(() => {
    captureError.mockClear();
    resetOvieHomePanelAlertsForTests();
  });

  it('sends a Sentry error tagged for the Ovie Home panel alert', () => {
    expect(reportOvieHomePanelError('shipping-loop', 'timeout')).toBe(true);
    expect(captureError).toHaveBeenCalledWith(
      'Ovie Home panel error: shipping-loop',
      expect.any(Error),
      expect.objectContaining({
        panel: 'shipping-loop',
        reason: 'timeout',
        alert: 'ovie-home-panel',
      })
    );
  });

  it('reports each panel and reason once per session', () => {
    reportOvieHomePanelError('asks', 'inbox-unavailable');
    expect(reportOvieHomePanelError('asks', 'inbox-unavailable')).toBe(false);
    reportOvieHomePanelError('shipping-projection', 'tasks.0.agent: bad');
    expect(captureError).toHaveBeenCalledTimes(2);
  });
});
