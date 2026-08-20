/**
 * Lite/full Sentry.init must receive shared ignoreErrors (JOV-5182).
 * setup-optimized mocks client-lite globally for component tests.
 */
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@/lib/sentry/client-lite');

import { getFullClientConfig } from '@/lib/sentry/client-full';
import { getLiteClientConfig } from '@/lib/sentry/client-lite';
import { getBaseClientConfig } from '@/lib/sentry/config';

function ignoresUpstashJsonBag(
  ignoreErrors: Array<string | RegExp> | undefined
): boolean {
  return Boolean(
    ignoreErrors?.some(
      pattern =>
        pattern instanceof RegExp &&
        pattern.test('{"error":{"name":"UpstashError"}}')
    )
  );
}

describe('client init configs (JOV-5182)', () => {
  it('forwards ignoreErrors and release into lite Sentry.init', () => {
    const base = getBaseClientConfig();
    const config = getLiteClientConfig({ enableBreadcrumbs: false });

    expect(ignoresUpstashJsonBag(config.ignoreErrors)).toBe(true);
    expect(config.release).toBe(base.release);
  });

  it('forwards ignoreErrors and release into full Sentry.init', () => {
    const base = getBaseClientConfig();
    const config = getFullClientConfig({
      enableBreadcrumbs: false,
      enableReplay: false,
    });

    expect(ignoresUpstashJsonBag(config.ignoreErrors)).toBe(true);
    expect(config.release).toBe(base.release);
  });
});
