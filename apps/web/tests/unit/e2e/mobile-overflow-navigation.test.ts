import { describe, expect, it, vi } from 'vitest';
import { waitForPendingNextRedirect } from '../../e2e/utils/mobile-overflow';

describe('waitForPendingNextRedirect', () => {
  it('waits for the exact server-rendered Next redirect target', async () => {
    const waitForURL = vi.fn().mockResolvedValue(undefined);
    const page = { waitForURL };
    const response = {
      text: vi
        .fn()
        .mockResolvedValue(
          '<template data-dgst="NEXT_REDIRECT;replace;/app?source=signin;307;"></template>'
        ),
      url: vi.fn().mockReturnValue('https://jov.ie/signin'),
    };

    await waitForPendingNextRedirect(page, response, 9_000);

    expect(waitForURL).toHaveBeenCalledOnce();
    const [matchesUrl, options] = waitForURL.mock.calls[0] as [
      (url: URL) => boolean,
      Record<string, unknown>,
    ];
    expect(matchesUrl(new URL('https://jov.ie/app?source=signin'))).toBe(true);
    expect(matchesUrl(new URL('https://jov.ie/app?source=other'))).toBe(false);
    expect(options).toEqual({
      waitUntil: 'domcontentloaded',
      timeout: 9_000,
    });
  });

  it('waits when the raw streamed response carries the redirect digest', async () => {
    const waitForURL = vi.fn().mockResolvedValue(undefined);
    const page = { waitForURL };
    const response = {
      text: vi
        .fn()
        .mockResolvedValue(
          '<script>self.__next_f.push([1,"c:E{\\"digest\\":\\"NEXT_REDIRECT;replace;/app;307;\\"}\\n"])</script>'
        ),
      url: vi.fn().mockReturnValue('https://jov.ie/signin'),
    };

    await waitForPendingNextRedirect(page, response, 9_000);

    expect(waitForURL).toHaveBeenCalledOnce();
    const [matchesUrl] = waitForURL.mock.calls[0] as [(url: URL) => boolean];
    expect(matchesUrl(new URL('https://jov.ie/app'))).toBe(true);
    expect(matchesUrl(new URL('https://jov.ie/signin'))).toBe(false);
  });

  it('preserves semicolons in the redirect destination', async () => {
    const waitForURL = vi.fn().mockResolvedValue(undefined);
    const page = { waitForURL };
    const response = {
      text: vi
        .fn()
        .mockResolvedValue(
          '<template data-dgst="NEXT_REDIRECT;push;/app;mode=compact?source=signin;303;"></template>'
        ),
      url: vi.fn().mockReturnValue('https://jov.ie/signin'),
    };

    await waitForPendingNextRedirect(page, response, 9_000);

    expect(waitForURL).toHaveBeenCalledOnce();
    const [matchesUrl] = waitForURL.mock.calls[0] as [(url: URL) => boolean];
    expect(
      matchesUrl(new URL('https://jov.ie/app;mode=compact?source=signin'))
    ).toBe(true);
    expect(matchesUrl(new URL('https://jov.ie/app'))).toBe(false);
  });

  it('does not wait when the response has no redirect digest', async () => {
    const waitForURL = vi.fn();
    const page = { waitForURL };
    const response = {
      text: vi.fn().mockResolvedValue('<main>Sign in</main>'),
      url: vi.fn().mockReturnValue('https://jov.ie/signin'),
    };

    await waitForPendingNextRedirect(page, response, 9_000);

    expect(waitForURL).not.toHaveBeenCalled();
  });

  it('does not treat unsupported redirect statuses as a Next redirect', async () => {
    const waitForURL = vi.fn();
    const page = { waitForURL };
    const response = {
      text: vi
        .fn()
        .mockResolvedValue(
          '<template data-dgst="NEXT_REDIRECT;replace;/legacy;301;"></template>'
        ),
      url: vi.fn().mockReturnValue('https://jov.ie/signin'),
    };

    await waitForPendingNextRedirect(page, response, 9_000);

    expect(waitForURL).not.toHaveBeenCalled();
  });
});
