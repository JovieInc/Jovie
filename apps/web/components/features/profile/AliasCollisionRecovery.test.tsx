import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AliasCollisionRecovery } from './AliasCollisionRecovery';

function installLocation(hash: string, protocol = 'https:') {
  const replace = vi.fn();
  const url = new URL(`${protocol}//jov.ie/dualipa?mode=listen${hash}`);
  vi.stubGlobal('location', {
    hash: url.hash,
    href: url.href,
    protocol: url.protocol,
    replace,
  });
  return replace;
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

describe('AliasCollisionRecovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'jovie_alias_content=; Max-Age=0';
  });

  it.each(['', '#alias=unknown', '#alias=listen%2Fother'])(
    'does not fetch a mode URL with no supported alias in %s',
    hash => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      installLocation(hash);

      render(<AliasCollisionRecovery username='dualipa' />);

      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('strips the hash when the alias should stay on the mode page', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ action: 'stay' }))
    );
    const replace = installLocation('#alias=listen');

    render(<AliasCollisionRecovery username='dualipa' />);

    await waitFor(() => {
      expect(replaceState).toHaveBeenCalled();
    });
    const nextUrl = replaceState.mock.calls.at(-1)?.[2];
    expect(String(nextUrl)).not.toContain('#');
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    { protocol: 'https:', secureAttribute: '; Secure' },
    { protocol: 'http:', secureAttribute: '' },
  ])(
    'holds a content collision over $protocol before returning to the public alias',
    async ({ protocol, secureAttribute }) => {
      const cookies: string[] = [];
      vi.spyOn(document, 'cookie', 'set').mockImplementation(value => {
        cookies.push(value);
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ action: 'content' }))
      );
      const replace = installLocation('#alias=listen', protocol);

      render(<AliasCollisionRecovery username='dualipa' />);

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith('/dualipa/listen');
      });
      expect(cookies).toEqual([
        `jovie_alias_content=1; Path=/dualipa/listen; Max-Age=300; SameSite=Lax${secureAttribute}`,
      ]);
    }
  );

  it('follows a renamed slug and ignores an off-site location', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ action: 'renamed', location: '/dualipa/new-slug' })
      )
      .mockResolvedValueOnce(
        jsonResponse({ action: 'renamed', location: 'https://evil.example/x' })
      );
    vi.stubGlobal('fetch', fetchMock);
    const replace = installLocation('#alias=listen');

    const { unmount } = render(<AliasCollisionRecovery username='dualipa' />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dualipa/new-slug');
    });

    unmount();
    replace.mockClear();
    render(<AliasCollisionRecovery username='dualipa' />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
