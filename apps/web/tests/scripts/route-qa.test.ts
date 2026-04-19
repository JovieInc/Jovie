import { describe, expect, it } from 'vitest';
import {
  isNotFoundLike,
  resolveRouteCaseTimeoutMs,
  settleWithTimeout,
} from '../../scripts/route-qa';

describe('route-qa not-found detection', () => {
  it('accepts explicit not-found copy variants', () => {
    expect(
      isNotFoundLike({
        responseStatus: 200,
        finalUrl: 'http://127.0.0.1:3100/missing-qa-user/missing-release',
        bodyText:
          '404 content not found this page may have been removed or the link may be incorrect',
        title: 'Not Found | Jovie',
        hasNotFoundTestId: false,
      })
    ).toBe(true);
  });

  it('accepts pages with the shared not-found test id even on a 200 response', () => {
    expect(
      isNotFoundLike({
        responseStatus: 200,
        finalUrl: 'http://127.0.0.1:3100/out/invalid-link',
        bodyText: 'link confirmation required',
        title: 'Link Confirmation Required | Jovie',
        hasNotFoundTestId: true,
      })
    ).toBe(true);
  });

  it('rejects normal successful pages', () => {
    expect(
      isNotFoundLike({
        responseStatus: 200,
        finalUrl: 'http://127.0.0.1:3100/e2e-test-user',
        bodyText: 'e2e test user stream now latest release',
        title: 'E2E Test User | Jovie',
        hasNotFoundTestId: false,
      })
    ).toBe(false);
  });

  it('times out unresolved route work so route qa can fail the case explicitly', async () => {
    await expect(
      settleWithTimeout(new Promise<void>(() => undefined), 10)
    ).resolves.toEqual({ timedOut: true });
  });

  it('uses a two minute per-route timeout by default', () => {
    expect(resolveRouteCaseTimeoutMs()).toBe(120_000);
  });
});
