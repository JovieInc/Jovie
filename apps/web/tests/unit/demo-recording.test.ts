import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_DEMO_RECORDING = process.env.DEMO_RECORDING;
const ORIGINAL_PUBLIC_DEMO_RECORDING = process.env.NEXT_PUBLIC_DEMO_RECORDING;
const ORIGINAL_DISABLE_TOOLBAR = process.env.NEXT_DISABLE_TOOLBAR;
const ORIGINAL_E2E_MODE = process.env.NEXT_PUBLIC_E2E_MODE;
const ORIGINAL_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS;

async function loadModule() {
  vi.resetModules();
  return import('@/lib/demo-recording');
}

afterEach(() => {
  if (ORIGINAL_DEMO_RECORDING === undefined) {
    delete process.env.DEMO_RECORDING;
  } else {
    process.env.DEMO_RECORDING = ORIGINAL_DEMO_RECORDING;
  }

  if (ORIGINAL_PUBLIC_DEMO_RECORDING === undefined) {
    delete process.env.NEXT_PUBLIC_DEMO_RECORDING;
  } else {
    process.env.NEXT_PUBLIC_DEMO_RECORDING = ORIGINAL_PUBLIC_DEMO_RECORDING;
  }

  if (ORIGINAL_DISABLE_TOOLBAR === undefined) {
    delete process.env.NEXT_DISABLE_TOOLBAR;
  } else {
    process.env.NEXT_DISABLE_TOOLBAR = ORIGINAL_DISABLE_TOOLBAR;
  }

  if (ORIGINAL_E2E_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_E2E_MODE;
  } else {
    process.env.NEXT_PUBLIC_E2E_MODE = ORIGINAL_E2E_MODE;
  }

  if (ORIGINAL_TEST_AUTH_BYPASS === undefined) {
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;
  } else {
    process.env.E2E_USE_TEST_AUTH_BYPASS = ORIGINAL_TEST_AUTH_BYPASS;
  }

  delete document.documentElement.dataset.demoRecording;
  delete document.documentElement.dataset.devChromeDisabled;
});

describe('demo recording helpers', () => {
  it('enables server recording mode when DEMO_RECORDING is set', async () => {
    process.env.DEMO_RECORDING = '1';
    delete process.env.NEXT_PUBLIC_DEMO_RECORDING;

    const { isDemoRecordingServer, isDemoRecordingClient } = await loadModule();

    expect(isDemoRecordingServer()).toBe(true);
    expect(isDemoRecordingClient()).toBe(false);
  });

  it('enables client recording mode only when NEXT_PUBLIC_DEMO_RECORDING is set', async () => {
    delete process.env.DEMO_RECORDING;
    process.env.NEXT_PUBLIC_DEMO_RECORDING = '1';

    const { isDemoRecordingServer, isDemoRecordingClient } = await loadModule();

    expect(isDemoRecordingServer()).toBe(true);
    expect(isDemoRecordingClient()).toBe(true);
  });

  it('suppresses root layout chrome in recording mode', async () => {
    const { getRootLayoutChromeState } = await loadModule();

    expect(
      getRootLayoutChromeState({
        devEnv: 'development',
        isDemoRecording: true,
        isE2EClientRuntime: false,
      })
    ).toEqual({
      isDemoRecording: true,
      isDevChromeDisabled: false,
      shouldRenderCookieBanner: false,
      shouldRenderDevChrome: false,
    });
  });

  it('suppresses screenshot chrome when NEXT_DISABLE_TOOLBAR is set', async () => {
    process.env.NEXT_DISABLE_TOOLBAR = '1';

    const { getRootLayoutChromeState } = await loadModule();

    expect(
      getRootLayoutChromeState({
        devEnv: 'development',
        isDemoRecording: false,
        isE2EClientRuntime: false,
      })
    ).toEqual({
      isDemoRecording: false,
      isDevChromeDisabled: true,
      shouldRenderCookieBanner: false,
      shouldRenderDevChrome: false,
    });
  });

  it('keeps normal development chrome when recording mode is off', async () => {
    const { getRootLayoutChromeState } = await loadModule();

    expect(
      getRootLayoutChromeState({
        devEnv: 'development',
        isDemoRecording: false,
        isE2EClientRuntime: false,
      })
    ).toEqual({
      isDemoRecording: false,
      isDevChromeDisabled: false,
      shouldRenderCookieBanner: true,
      shouldRenderDevChrome: true,
    });
  });

  it('suppresses dev chrome when NEXT_PUBLIC_E2E_MODE is set', async () => {
    process.env.NEXT_PUBLIC_E2E_MODE = '1';
    const { getRootLayoutChromeState } = await loadModule();

    expect(
      getRootLayoutChromeState({
        devEnv: 'development',
        isDemoRecording: false,
      })
    ).toEqual({
      isDemoRecording: false,
      isDevChromeDisabled: false,
      shouldRenderCookieBanner: true,
      shouldRenderDevChrome: false,
    });
  });

  it('keeps dev chrome when only the test auth bypass is enabled', async () => {
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    const { getRootLayoutChromeState } = await loadModule();

    expect(
      getRootLayoutChromeState({
        devEnv: 'development',
        isDemoRecording: false,
      })
    ).toEqual({
      isDemoRecording: false,
      isDevChromeDisabled: false,
      shouldRenderCookieBanner: true,
      shouldRenderDevChrome: true,
    });
  });

  it('reads client chrome suppression from the html dataset', async () => {
    document.documentElement.dataset.devChromeDisabled = '1';

    const { isDevChromeDisabledClient } = await loadModule();

    expect(isDevChromeDisabledClient()).toBe(true);
  });
});
