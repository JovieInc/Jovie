import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { type AgentContextRequest, displayText } from './contracts';

/** Opt-in foundation. The current composer/transport is intentionally not wired. */
export function toLibraryAgentRequest(
  asset: Pick<
    LibraryReleaseAsset,
    'id' | 'title' | 'artist' | 'updatedAt' | 'itemKind'
  >,
  profileId: string
): AgentContextRequest {
  return {
    message: displayText('Help me with this library item.'),
    contextAttachments: [
      {
        kind: 'library-item',
        itemKind: asset.itemKind ?? 'release',
        entityId: asset.id,
        profileId,
        revision: asset.updatedAt ?? null,
        display: {
          title: displayText(asset.title),
          ...(asset.artist.trim()
            ? { description: displayText(asset.artist) }
            : {}),
        },
      },
    ],
  };
}
