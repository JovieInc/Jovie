import { serializeEntity } from '@/lib/chat/tokens';
import type { ProfilesWorkspaceData, ProfileWorkspaceRow } from './data';

/**
 * Draft for "Chat about this" on a Profiles row.
 *
 * The selected creator profile travels as an `@profile:<id>[name]` entity
 * token: the composer shows it as a chip and the server resolves the id
 * against the signed-in creator's own data. Internal ids and machine context
 * never appear as text the user reads.
 */
export function connectionChatDraft(
  row: ProfileWorkspaceRow,
  data: Pick<ProfilesWorkspaceData, 'profileId' | 'artist'>
): string {
  const profileChip = serializeEntity({
    kind: 'profile',
    id: data.profileId,
    label: data.artist.name,
  });
  if (row.rowType === 'surface' && row.kind === 'jovie') return profileChip;
  return `${profileChip} ${connectionAsk(row)}`;
}

function connectionAsk(row: ProfileWorkspaceRow): string {
  const where = readableUrl(row.url) ?? row.handle?.trim();
  const shown =
    where && where.toLowerCase() !== row.label.trim().toLowerCase()
      ? ` (${where})`
      : '';
  return `Help me with my ${row.label}${shown}.`;
}

/** Public link as a person reads it: no scheme, no trailing slash. */
function readableUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.host.replace(/^www\./, '')}${path}`;
  } catch {
    return null;
  }
}
