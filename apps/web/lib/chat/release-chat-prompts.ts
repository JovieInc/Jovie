import { serializeEntity } from '@/lib/chat/tokens';

/**
 * Chat asks for release actions that aren't pitches (pitches live in
 * `lib/services/pitch/targets.ts`). The release travels as an
 * `@release:<id>[title]` token, which the bubble shows as a chip and the server
 * resolves against the artist's own catalog, so no id or JSON is ever text a
 * person reads.
 */
export function buildReleaseAlbumArtChatPrompt(params: {
  readonly releaseId: string;
  readonly releaseTitle: string;
}): string {
  const release = serializeEntity({
    kind: 'release',
    id: params.releaseId,
    label: params.releaseTitle,
  });
  return `Generate album art for ${release}. Show me three options, and attach the one I pick to this release.`;
}
