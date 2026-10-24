import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/desktop/download/route';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { unregisterServiceWorker } from '@/lib/service-worker/control';

vi.mock('@/lib/service-worker/control', () => ({
  isSwEnabled: () => true,
  registerServiceWorker: vi.fn().mockResolvedValue(undefined),
  unregisterServiceWorker: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));

const providerUrl =
  'https://api.github.com/repos/JovieInc/Jovie/releases/latest';
const capabilitiesUrl = '/api/desktop/download?format=capabilities';
const downloadUrl =
  'https://github.com/JovieInc/Jovie/releases/download/v26.10.8/Jovie-26.10.8-universal.dmg';
const asset = {
  name: 'Jovie-26.10.8-universal.dmg',
  browser_download_url: downloadUrl,
  size: 120_000_000,
};
const release = {
  tag_name: 'v26.10.8',
  published_at: '2026-10-08T00:00:00Z',
  html_url: 'https://github.com/JovieInc/Jovie/releases/tag/v26.10.8',
  assets: [asset],
};
const provider = vi.fn<typeof fetch>();
let capabilityResponse: Response | undefined;
let capabilityRequest: Promise<Response> | undefined;

function platform(version: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    `Mozilla/5.0 (Macintosh; Intel Mac OS X ${version}) Chrome/152 Safari/537.36`
  );
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: 0,
  });
}
function promptEvent() {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
}
function mount() {
  const hook = renderHook(usePWAInstall);
  const event = promptEvent();
  act(() => {
    window.dispatchEvent(event);
  });
  return { ...hook, event };
}
async function settleCapabilities() {
  await waitFor(() => expect(capabilityRequest).toBeDefined());
  await act(async () => {
    await capabilityRequest;
  });
  expect(capabilityResponse).toBeDefined();
  return capabilityResponse as Response;
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('existing-pwa-data', 'retain');
  capabilityRequest = undefined;
  capabilityResponse = undefined;
  provider.mockReset().mockImplementation(async () => Response.json(release));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, options) => {
      if (input === capabilitiesUrl) {
        capabilityRequest = GET(
          new Request(`https://jov.ie${capabilitiesUrl}`)
        );
        const response = await capabilityRequest;
        capabilityResponse = response.clone();
        return response;
      }
      expect(input).toBe(providerUrl);
      return provider(input, options);
    })
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
});

const unknownSnapshots = [
  {
    name: 'offline provider',
    respond: async () => {
      throw new TypeError('offline');
    },
  },
  {
    name: 'provider HTTP failure',
    respond: async () => new Response(null, { status: 503 }),
  },
  { name: 'invalid JSON', respond: async () => new Response('{') },
  { name: 'empty body', respond: async () => new Response(null) },
  { name: 'null payload', respond: async () => Response.json(null) },
  {
    name: 'missing assets',
    respond: async () => Response.json({ ...release, assets: undefined }),
  },
  {
    name: 'empty cached assets snapshot',
    respond: async () =>
      Response.json({ ...release, assets: [] }, { headers: { Age: '7200' } }),
  },
  {
    name: 'malformed assets',
    respond: async () => Response.json({ ...release, assets: {} }),
  },
  {
    name: 'missing artifact URL',
    respond: async () =>
      Response.json({
        ...release,
        assets: [{ name: asset.name, size: asset.size }],
      }),
  },
  {
    name: 'empty artifact URL',
    respond: async () =>
      Response.json({
        ...release,
        assets: [{ ...asset, browser_download_url: '' }],
      }),
  },
  {
    name: 'malformed artifact URL',
    respond: async () =>
      Response.json({
        ...release,
        assets: [{ ...asset, browser_download_url: 42 }],
      }),
  },
  {
    name: 'unsafe artifact URL',
    respond: async () =>
      Response.json({
        ...release,
        assets: [{ ...asset, browser_download_url: 'javascript:alert(1)' }],
      }),
  },
  {
    name: 'empty artifact',
    respond: async () =>
      Response.json({ ...release, assets: [{ ...asset, size: 0 }] }),
  },
  {
    name: 'unrelated release without a universal DMG',
    respond: async () =>
      Response.json({
        ...release,
        assets: [{ ...asset, name: 'Jovie-x64.zip' }],
      }),
  },
];

describe.each(['13_6', '10_15_7'])(
  'release provider → capability endpoint → PWA hook on Mac UA %s',
  version => {
    it.each(unknownSnapshots)(
      'keeps $name unknown and quiet',
      async ({ respond }) => {
        platform(version);
        provider.mockImplementation(respond);
        const writes = vi.spyOn(Storage.prototype, 'setItem');
        const removes = vi.spyOn(Storage.prototype, 'removeItem');
        const clears = vi.spyOn(Storage.prototype, 'clear');
        const { result, event } = mount();
        const response = await settleCapabilities();
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
          available: null,
          minimumMacOSMajor: 13,
          architectures: ['arm64', 'x64'],
          artifact: 'universal',
        });
        expect(result.current.canPrompt).toBe(false);
        await act(() => result.current.install());
        expect(event.prompt).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
        expect(localStorage.getItem('existing-pwa-data')).toBe('retain');
        expect(writes).not.toHaveBeenCalled();
        expect(removes).not.toHaveBeenCalled();
        expect(clears).not.toHaveBeenCalled();
        expect(unregisterServiceWorker).not.toHaveBeenCalled();
      }
    );

    it('keeps a provider timeout unknown and quiet', async () => {
      vi.useFakeTimers();
      platform(version);
      provider.mockImplementation(
        (_input, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Timed out', 'AbortError')),
              { once: true }
            );
          })
      );
      const { result, event } = mount();
      await act(async () => {
        await Promise.resolve();
      });
      expect(provider).toHaveBeenCalledOnce();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      vi.useRealTimers();
      const response = await settleCapabilities();
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ available: null });
      expect(provider.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(result.current.canPrompt).toBe(false);
      await act(() => result.current.install());
      expect(event.prompt).not.toHaveBeenCalled();
    });

    it('confirms a valid universal artifact without needing installation knowledge', async () => {
      platform(version);
      const { result, event } = mount();
      const response = await settleCapabilities();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ available: true });
      expect(provider).toHaveBeenCalledWith(
        providerUrl,
        expect.objectContaining({
          next: { revalidate: 3600 },
          headers: expect.objectContaining({ 'User-Agent': 'jovie-web' }),
        })
      );
      expect(fetch).toHaveBeenCalledWith(capabilitiesUrl, {
        signal: expect.any(AbortSignal),
      });
      expect(result.current.canPrompt).toBe(false);
      await act(() => result.current.install());
      expect(event.prompt).not.toHaveBeenCalled();
    });
  }
);

describe('download redirects and definitive platform fallback', () => {
  it('redirects only to validated artifacts and preserves the release-page fallback', async () => {
    expect((await GET()).headers.get('location')).toBe(downloadUrl);
    for (const { respond } of unknownSnapshots) {
      provider.mockImplementation(respond);
      expect((await GET()).headers.get('location')).toBe(
        'https://github.com/JovieInc/Jovie/releases'
      );
    }
  });
  it('ignores a malformed unrelated asset when a usable universal artifact exists', async () => {
    provider.mockResolvedValue(
      Response.json({ ...release, assets: [null, {}, asset] })
    );
    expect((await GET()).headers.get('location')).toBe(downloadUrl);
  });
  it('retains definitively incompatible Mac fallback while the provider is offline', async () => {
    platform('12_7');
    provider.mockRejectedValue(new TypeError('offline'));
    const { result, event } = mount();
    await waitFor(() => expect(result.current.canPrompt).toBe(true));
    await act(() => result.current.install());
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});
