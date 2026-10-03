import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeInitSource = readFileSync(
  join(process.cwd(), 'public/electron-runtime-init.js'),
  'utf8'
);

function runRuntimeInit() {
  new Function(runtimeInitSource)();
}

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

const serviceWorkerMocks = vi.hoisted(() => {
  const unregister = vi.fn(async () => true);
  const getRegistrations = vi.fn(async () => [{ unregister }]);
  return { unregister, getRegistrations };
});

vi.stubGlobal('navigator', {
  userAgent: 'Mozilla/5.0',
  serviceWorker: {
    getRegistrations: serviceWorkerMocks.getRegistrations,
  },
});

function resetRuntimeMarker() {
  document.documentElement.removeAttribute('data-desktop-runtime');
  document.documentElement.removeAttribute('data-dev-chrome-disabled');
  document.documentElement.removeAttribute('data-electron-platform');
  document.documentElement.style.removeProperty('--dev-toolbar-height');
  serviceWorkerMocks.unregister.mockClear();
  serviceWorkerMocks.getRegistrations.mockClear();
  serviceWorkerMocks.getRegistrations.mockResolvedValue([
    { unregister: serviceWorkerMocks.unregister },
  ]);
}

describe('electron-runtime-init', () => {
  beforeEach(() => {
    resetRuntimeMarker();
    setUserAgent('Mozilla/5.0');
    window.history.replaceState({}, '', '/app');
  });

  afterEach(() => {
    resetRuntimeMarker();
    setUserAgent('Mozilla/5.0');
    window.history.replaceState({}, '', '/');
  });

  it('marks Electron runtime from the launch query before React hydrates', () => {
    window.history.replaceState({}, '', '/app?runtime=electron');

    runRuntimeInit();

    expect(document.documentElement).toHaveAttribute(
      'data-desktop-runtime',
      'electron'
    );
    expect(document.documentElement).toHaveAttribute(
      'data-dev-chrome-disabled',
      '1'
    );
    expect(
      document.documentElement.style.getPropertyValue('--dev-toolbar-height')
    ).toBe('0px');
  });

  it('marks Electron runtime from the desktop user agent', () => {
    setUserAgent('Mozilla/5.0 JovieDesktop/26.5.12');

    runRuntimeInit();

    expect(document.documentElement).toHaveAttribute(
      'data-desktop-runtime',
      'electron'
    );
  });

  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/37 JovieDesktop/26.9.16',
      'darwin',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/37 JovieDesktop/26.9.16',
      'win32',
    ],
  ])('marks the window platform before paint for %s', (userAgent, platform) => {
    setUserAgent(userAgent);

    runRuntimeInit();

    expect(document.documentElement).toHaveAttribute(
      'data-electron-platform',
      platform
    );
  });

  it('keeps the platform the preload already set', () => {
    document.documentElement.dataset.electronPlatform = 'darwin';
    setUserAgent('Mozilla/5.0 (Windows NT 10.0) JovieDesktop/26.9.16');

    runRuntimeInit();

    expect(document.documentElement).toHaveAttribute(
      'data-electron-platform',
      'darwin'
    );
  });

  it('does not mark normal browser sessions', () => {
    runRuntimeInit();

    expect(document.documentElement).not.toHaveAttribute(
      'data-desktop-runtime'
    );
    expect(document.documentElement).not.toHaveAttribute(
      'data-dev-chrome-disabled'
    );
    expect(document.documentElement).not.toHaveAttribute(
      'data-electron-platform'
    );
    expect(serviceWorkerMocks.getRegistrations).not.toHaveBeenCalled();
  });

  it('unregisters stale service workers in Electron sessions', async () => {
    window.history.replaceState({}, '', '/app?runtime=electron');

    runRuntimeInit();

    await Promise.resolve();

    expect(serviceWorkerMocks.getRegistrations).toHaveBeenCalledTimes(1);
    expect(serviceWorkerMocks.unregister).toHaveBeenCalledTimes(1);
  });
});
