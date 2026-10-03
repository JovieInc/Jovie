import { afterEach, describe, expect, it, vi } from 'vitest';

import { isInstantlyOutboundEnabled } from '@/lib/leads/outbound-gates';

describe('isInstantlyOutboundEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays closed when the flag is unset', () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', '');
    expect(isInstantlyOutboundEnabled()).toBe(false);
  });

  it('stays closed unless the flag is the exact string true', () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'TRUE');
    expect(isInstantlyOutboundEnabled()).toBe(false);
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', '1');
    expect(isInstantlyOutboundEnabled()).toBe(false);
  });

  it('opens only when FEATURE_INSTANTLY_OUTBOUND is true', () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'true');
    expect(isInstantlyOutboundEnabled()).toBe(true);
  });
});
