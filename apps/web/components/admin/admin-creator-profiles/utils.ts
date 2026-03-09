import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { Contact } from '@/types';

/**
 * Maps an AdminCreatorProfileRow to a Contact object for the sidebar.
 */
export function mapProfileToContact(
  profile: AdminCreatorProfileRow | null
): Contact | null {
  if (!profile) return null;
  const nameParts = (profile.displayName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = nameParts[0] ?? undefined;
  const lastName = nameParts.slice(1).join(' ') || undefined;

  return {
    id: profile.id,
    username: profile.username,
    displayName:
      'displayName' in profile ? (profile.displayName ?? null) : null,
    firstName,
    lastName,
    avatarUrl: profile.avatarUrl ?? null,
    socialLinks: (profile.socialLinks ?? []).map(link => ({
      id: link.id,
      label: link.displayText ?? link.platform,
      url: link.url,
      platformType: link.platformType,
    })),
  };
}
