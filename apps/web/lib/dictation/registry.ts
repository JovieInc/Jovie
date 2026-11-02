import type { DictationProvider } from './types';

export const DICTATION_PROVIDER_ORDER = [
  'elevenlabs-stream',
  'elevenlabs-batch',
  'fish-batch',
  'web-speech',
] as const;
export function createDictationRegistry(
  providers: readonly DictationProvider[],
  runtime: 'web' | 'electron'
): DictationProvider[] {
  return DICTATION_PROVIDER_ORDER.flatMap(id =>
    providers.filter(
      provider =>
        provider.id === id &&
        provider.capabilities.runsIn.includes(runtime) &&
        !(runtime === 'electron' && id === 'web-speech')
    )
  );
}
