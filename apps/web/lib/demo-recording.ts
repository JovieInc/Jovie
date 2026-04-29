const DEMO_RECORDING_ENABLED_VALUE = '1';

function isEnabled(value: string | undefined): boolean {
  return value === DEMO_RECORDING_ENABLED_VALUE;
}

function getRuntimeHtmlDatasetValue(
  key: 'demoRecording' | 'devChromeDisabled'
): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  return document.documentElement.dataset[key] || undefined;
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
    isEnabled(getRuntimeHtmlDatasetValue('demoRecording'))
  );
}

export function isDevChromeDisabledServer(): boolean {
  return isEnabled(process.env.NEXT_DISABLE_TOOLBAR);
}

export function isDevChromeDisabledClient(): boolean {
  return isEnabled(getRuntimeHtmlDatasetValue('devChromeDisabled'));
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
