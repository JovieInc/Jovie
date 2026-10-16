import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/service-worker/control', () => ({
  isSwEnabled: () => true,
  registerServiceWorker: vi.fn().mockResolvedValue(undefined),
  unregisterServiceWorker: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
const mac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/152 Safari/537.36';
function platform(ua: string, touch = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(
    ua.includes('Mac') ? 'MacIntel' : 'Win32'
  );
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: touch,
  });
}
function promptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ available: true }) })
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'userAgentData');
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
  Reflect.deleteProperty(window, 'electronAPI');
  document.documentElement.removeAttribute('data-desktop-runtime');
  vi.resetModules();
});
async function mount() {
  const { usePWAInstall } = await import('./usePWAInstall');
  return renderHook(usePWAInstall);
}
describe('Mac/PWA install policy', () => {
  it.each([undefined, '13.6.0', '26.0.0'])(
    'suppresses frozen modern Mac UA with hints %s, regardless of installed knowledge',
    async version => {
      platform(mac);
      if (version)
        Object.defineProperty(navigator, 'userAgentData', {
          configurable: true,
          value: {
            getHighEntropyValues: async () => ({ platformVersion: version }),
          },
        });
      const { result } = await mount();
      const event = promptEvent();
      act(() => {
        window.dispatchEvent(event);
      });
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(result.current.canPrompt).toBe(false);
      await act(() => result.current.install());
      expect(event.prompt).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    }
  );
  it.each(['rejected', 'malformed', 'empty', 'http-error'])(
    'stays quiet on %s availability evidence',
    async mode => {
      platform(mac);
      vi.mocked(fetch).mockImplementation(async () => {
        if (mode === 'rejected') throw new Error('offline');
        return {
          ok: mode !== 'http-error',
          json: async () => (mode === 'empty' ? null : {}),
        } as Response;
      });
      const { result } = await mount();
      act(() => {
        window.dispatchEvent(promptEvent());
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.canPrompt).toBe(false);
    }
  );
  it('stays quiet when the capability endpoint itself times out', async () => {
    vi.useFakeTimers();
    platform(mac);
    vi.mocked(fetch).mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Timed out', 'AbortError')),
            { once: true }
          );
        })
    );
    const { result } = await mount();
    const event = promptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    vi.useRealTimers();
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(result.current.canPrompt).toBe(false);
    await act(() => result.current.install());
    expect(event.prompt).not.toHaveBeenCalled();
  });
  it('retains web fallback when the supported native download is explicitly unavailable', async () => {
    platform(mac);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ available: false }),
    } as Response);
    const { result } = await mount();
    const event = promptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    await waitFor(() => expect(result.current.canPrompt).toBe(true));
    await act(() => result.current.install());
    expect(event.prompt).toHaveBeenCalledOnce();
  });
  it.each(['12_7', '11_7', '10_14_6'])(
    'retains definitively incompatible Mac fallback %s',
    async version => {
      platform(mac.replace('10_15_7', version));
      const { result } = await mount();
      act(() => {
        window.dispatchEvent(promptEvent());
      });
      await waitFor(() => expect(result.current.canPrompt).toBe(true));
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it('uses actual below-floor client hints despite the frozen UA', async () => {
    platform(mac);
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        getHighEntropyValues: async () => ({ platformVersion: '12.7.0' }),
      },
    });
    const { result } = await mount();
    act(() => {
      window.dispatchEvent(promptEvent());
    });
    await waitFor(() => expect(result.current.canPrompt).toBe(true));
  });
  it.each(['ua-only', 'marker-only', 'bridge-only'])(
    'suppresses native runtime with %s timing',
    async mode => {
      platform(mode === 'ua-only' ? `${mac} JovieDesktop/26.10.16` : mac);
      if (mode === 'marker-only')
        document.documentElement.dataset.desktopRuntime = 'electron';
      if (mode === 'bridge-only')
        Object.defineProperty(window, 'electronAPI', {
          configurable: true,
          value: { platform: 'darwin' },
        });
      const { result } = await mount();
      act(() => {
        window.dispatchEvent(promptEvent());
      });
      expect(result.current.canPrompt).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it('revokes an earlier web prompt when a delayed native bridge becomes visible', async () => {
    platform('Windows NT 10.0 Chrome/152');
    const { result } = await mount();
    act(() => {
      window.dispatchEvent(promptEvent());
    });
    await waitFor(() => expect(result.current.canPrompt).toBe(true));
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { platform: 'darwin' },
    });
    const event = promptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.canPrompt).toBe(false);
    await act(() => result.current.install());
    expect(event.prompt).not.toHaveBeenCalled();
  });

  it('preserves Windows install, dismissal and already installed behavior', async () => {
    platform('Windows NT 10.0 Chrome/152');
    const { result } = await mount();
    act(() => {
      window.dispatchEvent(promptEvent());
    });
    await waitFor(() => expect(result.current.canPrompt).toBe(true));
    act(() => result.current.dismiss());
    expect(result.current.canPrompt).toBe(false);
    act(() => {
      window.dispatchEvent(promptEvent());
    });
    expect(result.current.canPrompt).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.isInstalled).toBe(true);
  });
  it('retains iPad Safari instructions despite its MacIntel platform', async () => {
    platform(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/26 Safari/605.1.15',
      5
    );
    const { result } = await mount();
    await waitFor(() => expect(result.current.canPrompt).toBe(true));
    expect(result.current.isIOS).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
