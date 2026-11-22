import type { CanonicalArtistMetrics } from '@/lib/onboarding/canonical-metrics';

export type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'output-denied'
  | 'approval-requested'
  | 'approval-responded'
  | (string & {})
  | undefined;

export interface ToolArtifactProps {
  readonly state?: ToolState;
}

export interface ArtistPickerOutput {
  readonly action?: 'open_artist_picker';
  readonly query?: string | null;
}

export interface ArtistConfirmedOutput {
  readonly action?: 'spotify_artist_confirmed';
  readonly spotifyArtistId?: string;
  readonly metrics?: CanonicalArtistMetrics | null;
  readonly artist?: {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly imageUrl?: string | null;
    readonly followers?: number | null;
    readonly metrics?: CanonicalArtistMetrics | null;
    readonly popularity?: number | null;
    readonly genres?: readonly string[];
    readonly dspMatches?: readonly OnboardingDspMatch[];
  } | null;
}

export interface HandleCheckOutput {
  readonly action?: 'check_handle' | 'handle_confirmed';
  readonly handle?: string;
}

export interface SocialLinkOutput {
  readonly action?: 'propose_social_link' | 'social_attached';
  readonly url?: string | null;
}

export interface OnboardingArtistSelection {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl?: string;
  readonly followers?: number;
  readonly metrics?: CanonicalArtistMetrics;
  readonly popularity?: number;
}

export interface OnboardingDspMatch {
  readonly id: string;
  readonly label: string;
  readonly platform: string;
  readonly url?: string | null;
}

export function isRunning(state: ToolState): boolean {
  return state === 'input-streaming' || state === 'input-available';
}

export function isFailed(state: ToolState): boolean {
  return state === 'output-error' || state === 'output-denied';
}
