const DEMO_RECORDING_ENABLED_VALUE = '1';

function isEnabled(value: string | undefined): boolean {
  return value === DEMO_RECORDING_ENABLED_VALUE;
}

export function isDemoRecordingServer(): boolean {
  return (
    isEnabled(process.env.DEMO_RECORDING) ||
    isEnabled(process.env.NEXT_PUBLIC_DEMO_RECORDING)
  );
}

export function isDemoRecordingClient(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_DEMO_RECORDING);
}

interface RootLayoutChromeStateInput {
  readonly devEnv: string;
  readonly isDemoRecording?: boolean;
  readonly isE2EClientRuntime?: boolean;
}

interface RootLayoutChromeState {
  readonly isDemoRecording: boolean;
  readonly shouldRenderCookieBanner: boolean;
  readonly shouldRenderDevChrome: boolean;
}

export function getRootLayoutChromeState({
  devEnv,
  isDemoRecording = isDemoRecordingServer(),
  isE2EClientRuntime = false,
}: RootLayoutChromeStateInput): RootLayoutChromeState {
  const shouldRenderDevChrome = !(
    isDemoRecording ||
    isE2EClientRuntime ||
    devEnv === 'production'
  );

  return {
    isDemoRecording,
    shouldRenderCookieBanner: !isDemoRecording,
    shouldRenderDevChrome,
  };
}
