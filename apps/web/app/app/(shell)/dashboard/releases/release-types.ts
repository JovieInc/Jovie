export interface ReleaseProfileContext {
  readonly userId: string;
  readonly profileId: string;
  readonly profileHandle: string;
  readonly spotifyId: string | null;
  readonly appleMusicId: string | null;
  readonly settings: Record<string, unknown> | null;
}
