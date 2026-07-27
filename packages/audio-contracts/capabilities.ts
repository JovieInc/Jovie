import type { AudioFormatId } from './index';

export const AUDIO_CAPABILITY_PLATFORMS = [
  'web_chromium',
  'desktop_chromium',
  'ios_avfoundation',
  'server_analysis',
] as const;

export type AudioCapabilityPlatform =
  (typeof AUDIO_CAPABILITY_PLATFORMS)[number];

export type AudioCapabilityPurpose =
  | 'uploadAcceptance'
  | 'masterPreservation'
  | 'nativePlayback'
  | 'waveformDecode'
  | 'analysisInput';

export type AudioCapabilityStatus =
  | 'direct'
  | 'derivative_required'
  | 'unavailable'
  | 'unverified'
  | 'not_applicable';

export interface AudioPlatformCapabilities {
  readonly uploadAcceptance: AudioCapabilityStatus;
  readonly masterPreservation: AudioCapabilityStatus;
  readonly nativePlayback: AudioCapabilityStatus;
  readonly waveformDecode: AudioCapabilityStatus;
  readonly analysisInput: AudioCapabilityStatus;
}

export type AudioCapabilityRegistry = Readonly<
  Record<
    AudioFormatId,
    Readonly<Record<AudioCapabilityPlatform, AudioPlatformCapabilities>>
  >
>;

const DIRECT_CHROMIUM_CAPABILITIES = {
  uploadAcceptance: 'direct',
  masterPreservation: 'direct',
  nativePlayback: 'direct',
  waveformDecode: 'direct',
  analysisInput: 'not_applicable',
} as const satisfies AudioPlatformCapabilities;

const AIFF_CHROMIUM_CAPABILITIES = {
  uploadAcceptance: 'direct',
  masterPreservation: 'direct',
  nativePlayback: 'derivative_required',
  waveformDecode: 'derivative_required',
  analysisInput: 'not_applicable',
} as const satisfies AudioPlatformCapabilities;

const UNVERIFIED_IOS_CAPABILITIES = {
  uploadAcceptance: 'unavailable',
  masterPreservation: 'unavailable',
  nativePlayback: 'unverified',
  waveformDecode: 'unverified',
  analysisInput: 'not_applicable',
} as const satisfies AudioPlatformCapabilities;

const DIRECT_SERVER_ANALYSIS_CAPABILITIES = {
  uploadAcceptance: 'direct',
  masterPreservation: 'direct',
  nativePlayback: 'not_applicable',
  waveformDecode: 'not_applicable',
  analysisInput: 'direct',
} as const satisfies AudioPlatformCapabilities;

// Stryker disable next-line BlockStatement: this registry helper executes
// during module initialization before Stryker can activate body mutants.
function directFormatCapabilities() {
  return {
    web_chromium: DIRECT_CHROMIUM_CAPABILITIES,
    desktop_chromium: DIRECT_CHROMIUM_CAPABILITIES,
    ios_avfoundation: UNVERIFIED_IOS_CAPABILITIES,
    server_analysis: DIRECT_SERVER_ANALYSIS_CAPABILITIES,
  } as const satisfies Readonly<
    Record<AudioCapabilityPlatform, AudioPlatformCapabilities>
  >;
}

/**
 * Canonical, evidence-scoped audio capability registry.
 *
 * A format being accepted for upload never implies that a runtime can play or
 * decode it. `unverified` is intentional: consumers must fail closed until a
 * real platform fixture proves support.
 */
export const AUDIO_CAPABILITY_REGISTRY = {
  mp3: directFormatCapabilities(),
  wav: directFormatCapabilities(),
  flac: directFormatCapabilities(),
  aiff: {
    web_chromium: AIFF_CHROMIUM_CAPABILITIES,
    desktop_chromium: AIFF_CHROMIUM_CAPABILITIES,
    ios_avfoundation: UNVERIFIED_IOS_CAPABILITIES,
    server_analysis: DIRECT_SERVER_ANALYSIS_CAPABILITIES,
  },
  aac: directFormatCapabilities(),
  m4a: directFormatCapabilities(),
} as const satisfies AudioCapabilityRegistry;

export type AudioDerivativeStatus =
  | 'pending'
  | 'ready'
  | 'failed'
  | 'unavailable'
  | 'retrying'
  | 'superseded';

interface AudioDerivativeBase {
  readonly generation: number;
  readonly sourceFormatId: AudioFormatId;
}

export type AudioPlaybackDerivative =
  | (AudioDerivativeBase & {
      readonly status: 'pending';
      readonly requestedAt: string;
    })
  | (AudioDerivativeBase & {
      readonly status: 'ready';
      readonly url: string;
      readonly mimeType: 'audio/wav';
      readonly readyAt: string;
      readonly outputBytes: number;
    })
  | (AudioDerivativeBase & {
      readonly status: 'failed';
      readonly reason:
        | 'invalid_source'
        | 'conversion_failed'
        | 'resource_limit'
        | 'storage_failed';
      readonly failedAt: string;
    })
  | (AudioDerivativeBase & {
      readonly status: 'unavailable';
      readonly reason: 'platform_unsupported' | 'conversion_not_supported';
    })
  | (AudioDerivativeBase & {
      readonly status: 'retrying';
      readonly attempt: number;
      readonly maxAttempts: number;
      readonly retryAt: string;
    })
  | (AudioDerivativeBase & {
      readonly status: 'superseded';
      readonly supersededAt: string;
    });

export interface AudioPlaybackAsset {
  readonly formatId: AudioFormatId;
  readonly masterUrl: string;
  readonly derivative?: AudioPlaybackDerivative | null;
}

export type AudioSourceResolution =
  | {
      readonly status: 'ready';
      readonly source: 'master' | 'derivative';
      readonly url: string;
    }
  | {
      readonly status: Exclude<AudioDerivativeStatus, 'ready'>;
      readonly source: null;
      readonly url: null;
    };

export function getAudioCapability(
  formatId: AudioFormatId,
  platform: AudioCapabilityPlatform,
  purpose: AudioCapabilityPurpose
): AudioCapabilityStatus {
  return AUDIO_CAPABILITY_REGISTRY[formatId][platform][purpose];
}

export function resolveAudioSource(
  asset: AudioPlaybackAsset,
  platform: AudioCapabilityPlatform,
  purpose: 'nativePlayback' | 'waveformDecode'
): AudioSourceResolution {
  const capability = getAudioCapability(asset.formatId, platform, purpose);

  if (capability === 'direct') {
    return { status: 'ready', source: 'master', url: asset.masterUrl };
  }

  if (capability !== 'derivative_required') {
    return { status: 'unavailable', source: null, url: null };
  }

  if (asset.derivative?.status === 'ready') {
    return {
      status: 'ready',
      source: 'derivative',
      url: asset.derivative.url,
    };
  }

  return {
    status: asset.derivative?.status ?? 'unavailable',
    source: null,
    url: null,
  };
}
