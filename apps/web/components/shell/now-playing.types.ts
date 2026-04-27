/**
 * Now-playing track shape — matches `useTrackAudioPlayer().playbackState`'s
 * field names so consumers can pass that object directly. All fields
 * nullable since the audio element emits null/empty before metadata loads.
 *
 * Lives in its own module so `SidebarNowPlaying` and `SidebarBottomNowPlaying`
 * each depend on a stable contract, not on each other.
 */
export interface NowPlayingTrack {
  readonly trackTitle: string | null | undefined;
  readonly artistName: string | null | undefined;
  readonly artworkUrl: string | null | undefined;
}
