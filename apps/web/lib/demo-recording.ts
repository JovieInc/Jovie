const DEMO_RECORDING_ENABLED_VALUE = '1';

declare global {
  interface Window {
    __JOVIE_DEMO_RECORDING__?: boolean | string;
    __JOVIE_DEV_CHROME_DISABLED__?: boolean | string;
  }
}

function isEnabled(value: boolean | string | undefined): boolean {
  return value === true || value === DEMO_RECORDING_ENABLED_VALUE;
}

function getRuntimeHtmlDatasetValue(
  key: 'demoRecording' | 'devChromeDisabled'
): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  return document.documentElement.dataset[key] || undefined;
}

function getRuntimeWindowFlagValue(
  key: '__JOVIE_DEMO_RECORDING__' | '__JOVIE_DEV_CHROME_DISABLED__'
): boolean | string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window[key];
}

export function isDemoRecordingServer(): boolean {
  return (
    isEnabled(process.env.DEMO_RECORDING) ||
    isEnabled(process.env.NEXT_PUBLIC_DEMO_RECORDING)
  );
}

export function isDemoRecordingClient(): boolean {
  return (
    isEnabled(process.env.NEXT_PUBLIC_DEMO_RECORDING) ||
    isEnabled(getRuntimeWindowFlagValue('__JOVIE_DEMO_RECORDING__')) ||
    isEnabled(getRuntimeHtmlDatasetValue('demoRecording'))
  );
}

export function isDevChromeDisabledServer(): boolean {
  return isEnabled(process.env.NEXT_DISABLE_TOOLBAR);
}

export function isDevChromeDisabledClient(): boolean {
  return (
    isEnabled(getRuntimeWindowFlagValue('__JOVIE_DEV_CHROME_DISABLED__')) ||
    isEnabled(getRuntimeHtmlDatasetValue('devChromeDisabled'))
  );
}

interface RootLayoutChromeStateInput {
  readonly devEnv: string;
  readonly isDemoRecording?: boolean;
  readonly isE2EClientRuntime?: boolean;
}

interface RootLayoutChromeState {
  readonly isDemoRecording: boolean;
  readonly isDevChromeDisabled: boolean;
  readonly shouldRenderCookieBanner: boolean;
  readonly shouldRenderDevChrome: boolean;
}

export function getRootLayoutChromeState({
  devEnv,
  isDemoRecording = isDemoRecordingServer(),
  isE2EClientRuntime = isEnabled(process.env.NEXT_PUBLIC_E2E_MODE),
}: RootLayoutChromeStateInput): RootLayoutChromeState {
  const isDevChromeDisabled = isDevChromeDisabledServer();
  const shouldRenderDevChrome = !(
    isDemoRecording ||
    isDevChromeDisabled ||
    isE2EClientRuntime ||
    devEnv === 'production'
  );

  return {
    isDemoRecording,
    isDevChromeDisabled,
    shouldRenderCookieBanner: !(isDemoRecording || isDevChromeDisabled),
    shouldRenderDevChrome,
  };
}
