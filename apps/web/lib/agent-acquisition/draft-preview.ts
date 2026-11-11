import type { PublicArtistSnapshot } from './artist-resolution';
import type { GoldenPathDraftState } from './golden-path';
import type { ReleaseLaunchResult } from './release-launch';

export interface StoredReleaseLaunch {
  readonly inputFingerprint: string;
  readonly result: ReleaseLaunchResult;
}

export interface AgentVisibilityDraftPreview extends PublicArtistSnapshot {
  readonly launch?: StoredReleaseLaunch;
  /** Golden-path tool state (handle request, Mom Test answers, catalog). */
  readonly golden_path?: GoldenPathDraftState;
}
