import { LyricsPageClient } from './LyricsPageClient';

interface Props {
  readonly params: Promise<{
    readonly trackId: string;
  }>;
}

/**
 * Lyrics route — track-scoped cinematic lyrics surface.
 *
 * `[trackId]` resolution to a real track is deferred — production today
 * has no `getTrackById` query. The route renders the surface bound to
 * the global audio player + a placeholder lyric set. When per-track lyric
 * storage lands, swap MOCK_LYRICS for `getLyricsByTrackId(trackId)`.
 */
export default async function LyricsPage({ params }: Props) {
  const { trackId } = await params;
  return <LyricsPageClient trackId={trackId} />;
}
