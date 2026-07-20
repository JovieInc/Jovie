import { describe, expect, it } from 'vitest';
import {
  assertExactNavigationUrl,
  captureOutgoingCookieHeader,
  isExactNavigationUrl,
  isSafePreviewBaseUrl,
  requireExactNavigationOrigin,
} from '../../helpers/vercel-preview';

describe('vercel preview helpers', () => {
  it('accepts only the fixed Jovie project and team deployment shape', () => {
    expect(
      isSafePreviewBaseUrl('https://jovie-5sy8pmjja-jovie.vercel.app')
    ).toBe(true);
  });

  it.each([
    'https://jov.ie',
    'https://foreign-deployment-other.vercel.app',
    'https://jovie-5sy8pmjja-jovie.vercel.app.attacker.example',
    'http://jovie-5sy8pmjja-jovie.vercel.app',
  ])('rejects a non-Jovie deployment origin: %s', url => {
    expect(isSafePreviewBaseUrl(url)).toBe(false);
  });

  it('accepts /app only on the exact configured deployment origin', () => {
    const exactOrigin = requireExactNavigationOrigin(
      'https://jovie-5sy8pmjja-jovie.vercel.app'
    );

    expect(
      isExactNavigationUrl(
        'https://jovie-5sy8pmjja-jovie.vercel.app/app/profile',
        exactOrigin
      )
    ).toBe(true);
    expect(
      assertExactNavigationUrl(
        'https://jovie-5sy8pmjja-jovie.vercel.app/app/profile',
        exactOrigin
      ).pathname
    ).toBe('/app/profile');
  });

  it.each([
    'https://jov.ie/app',
    'https://foreign.example/app',
    'https://jovie-5sy8pmjja-jovie.vercel.app.attacker.example/app',
  ])('rejects canonical or foreign /app false positives: %s', url => {
    const exactOrigin = 'https://jovie-5sy8pmjja-jovie.vercel.app';

    expect(isExactNavigationUrl(url, exactOrigin)).toBe(false);
    expect(() =>
      assertExactNavigationUrl(url, exactOrigin, 'Auth redirect')
    ).toThrow('Auth redirect left the exact deployment origin');
  });

  it('installs the cookie-capture route before browser navigation starts', async () => {
    let routeInstalled = false;
    let routeHandler:
      | ((route: {
          request: () => {
            isNavigationRequest: () => boolean;
            allHeaders: () => Promise<Record<string, string>>;
          };
          abort: () => Promise<void>;
        }) => Promise<void>)
      | undefined;
    const page = {
      route: async (_pattern: string, handler: typeof routeHandler) => {
        await Promise.resolve();
        routeHandler = handler;
        routeInstalled = true;
      },
      goto: async () => {
        expect(routeInstalled).toBe(true);
        await routeHandler?.({
          request: () => ({
            isNavigationRequest: () => true,
            allHeaders: async () => ({ cookie: 'host-only=value' }),
          }),
          abort: async () => {},
        });
      },
      close: async () => {},
    };
    const context = { newPage: async () => page };

    await expect(
      captureOutgoingCookieHeader(
        context as never,
        new URL('https://jovie-5sy8pmjja-jovie.vercel.app/probe')
      )
    ).resolves.toBe('host-only=value');
  });
});
