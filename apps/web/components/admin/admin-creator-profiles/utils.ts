import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { Contact } from '@/types';

/**
 * Maps an AdminCreatorProfileRow to a Contact object for the sidebar.
 */
export function mapProfileToContact(
  profile: AdminCreatorProfileRow | null
): Contact | null {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    displayName:
      'displayName' in profile ? (profile.displayName ?? null) : null,
    firstName: undefined,
    lastName: undefined,
    avatarUrl: profile.avatarUrl ?? null,
    socialLinks: [],
  };
}
