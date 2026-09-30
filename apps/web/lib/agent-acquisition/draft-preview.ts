import type { PublicArtistSnapshot } from './artist-resolution';
import type { ReleaseLaunchResult } from './release-launch';

export interface StoredReleaseLaunch {
  readonly inputFingerprint: string;
  readonly result: ReleaseLaunchResult;
}

export interface AgentVisibilityDraftPreview extends PublicArtistSnapshot {
  readonly launch?: StoredReleaseLaunch;
}
