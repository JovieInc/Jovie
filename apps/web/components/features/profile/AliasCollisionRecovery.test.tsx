import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLegacyAliasHoldCookie,
  isSafeRenamedAliasLocation,
  readLegacyAliasHash,
} from '@/lib/routing/legacy-alias-client';
import {
  buildLegacyAliasHoldCookie as cjsBuildLegacyAliasHoldCookie,
  isSafeRenamedAliasLocation as cjsIsSafeRenamedAliasLocation,
  readLegacyAliasHash as cjsReadLegacyAliasHash,
} from '@/lib/routing/legacy-profile-alias-redirects';
import { AliasCollisionRecovery } from './AliasCollisionRecovery';

function installLocation(hash: string) {
  const replace = vi.fn();
  const url = new URL(`https://jov.ie/dualipa?mode=listen${hash}`);
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

  it('does not fetch a mode URL that has no alias hash', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    installLocation('');

    render(<AliasCollisionRecovery username='dualipa' />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

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

  it('holds a content collision and returns to the public alias', async () => {
    const cookies: string[] = [];
    vi.spyOn(document, 'cookie', 'set').mockImplementation(value => {
      cookies.push(value);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ action: 'content' }))
    );
    const replace = installLocation('#alias=listen');

    render(<AliasCollisionRecovery username='dualipa' />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dualipa/listen');
    });
    expect(
      cookies.some(cookie => cookie.startsWith('jovie_alias_content=1'))
    ).toBe(true);
  });

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

  it('client helpers stay byte-identical to the next.config CJS module', () => {
    // The edge redirect's bypass conditions key on the cookie/hash values the
    // client writes; a drift silently breaks the collision recovery. The CJS
    // module cannot be imported by the browser story build (raw CJS via the
    // alias has no interop), so the client copies are pinned to it here.
    expect(cjsReadLegacyAliasHash('#alias=music')).toBe(
      readLegacyAliasHash('#alias=music')
    );
    expect(cjsReadLegacyAliasHash('#alias=not-a-mode')).toBe(
      readLegacyAliasHash('#alias=not-a-mode')
    );
    expect(cjsBuildLegacyAliasHoldCookie('dualipa', 'listen', true)).toBe(
      buildLegacyAliasHoldCookie('dualipa', 'listen', true)
    );
    expect(cjsBuildLegacyAliasHoldCookie('../escape', 'listen', false)).toBe(
      buildLegacyAliasHoldCookie('../escape', 'listen', false)
    );
    expect(cjsIsSafeRenamedAliasLocation('/dualipa/new-slug')).toBe(
      isSafeRenamedAliasLocation('/dualipa/new-slug')
    );
    expect(cjsIsSafeRenamedAliasLocation('https://evil.example/x')).toBe(
      isSafeRenamedAliasLocation('https://evil.example/x')
    );
  });
});
