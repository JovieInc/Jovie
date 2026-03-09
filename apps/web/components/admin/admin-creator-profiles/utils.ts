import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { Contact } from '@/types';

function splitDisplayName(displayName: string | null | undefined): {
  firstName: string | undefined;
  lastName: string | undefined;
} {
  const normalizedName = displayName?.trim();
  if (!normalizedName) {
    return { firstName: undefined, lastName: undefined };
  }

  const [firstName, ...rest] = normalizedName.split(/\s+/);
  const lastName = rest.join(' ').trim();

  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
  };
}

/**
 * Maps an AdminCreatorProfileRow to a Contact object for the sidebar.
 */
export function mapProfileToContact(
  profile: AdminCreatorProfileRow | null
): Contact | null {
  if (!profile) return null;
  const { firstName, lastName } = splitDisplayName(profile.displayName);

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
