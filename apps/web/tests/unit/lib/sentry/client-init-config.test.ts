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

describe('Sentry 11 lite breadcrumb policy', () => {
  it.each([true, false])(
    'respects enableBreadcrumbs=%s for both breadcrumb integrations',
    enabled => {
      const config = getLiteClientConfig({ enableBreadcrumbs: enabled });
      if (typeof config.integrations !== 'function')
        throw new Error('Expected integration filter');
      const defaults = [
        'GlobalHandlers',
        'Breadcrumbs',
        'Console',
        'BrowserTracing',
        'Replay',
      ].map(name => ({ name }));
      expect(
        config.integrations(defaults).map(integration => integration.name)
      ).toEqual(
        enabled
          ? ['GlobalHandlers', 'Breadcrumbs', 'Console']
          : ['GlobalHandlers']
      );
    }
  );
});
