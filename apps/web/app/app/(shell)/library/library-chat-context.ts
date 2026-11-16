import { serializeEntity } from '@/lib/chat/tokens';
import type { LibraryItemKind, LibraryReleaseAsset } from './library-data';

const ITEM_NOUN: Record<LibraryItemKind, string> = {
  release: 'release',
  merch: 'merch item',
  image: 'image',
  video: 'video',
  audio: 'audio file',
  document: 'document',
};

/**
 * Draft for "Ask Jovie" on a Library item.
 *
 * A release travels as an `@release:<id>[title]` entity token: the composer
 * shows it as a chip and the server resolves the id against the creator's own
 * catalog, so the first reply already knows which release was clicked. Items
 * with no entity kind yet (merch, documents, media) are named in plain words
 * with their title. Internal ids and JSON never appear as text a person reads.
 */
export function buildLibraryAskJovieDraft(
  asset: LibraryReleaseAsset,
  _profileId: string
): string {
  const kind: LibraryItemKind = asset.itemKind ?? 'release';
  if (kind === 'release') {
    return serializeEntity({
      kind: 'release',
      id: asset.id,
      label: asset.title,
    });
  }
  return `Help me with my ${ITEM_NOUN[kind]} "${asset.title.trim()}".`;
}
