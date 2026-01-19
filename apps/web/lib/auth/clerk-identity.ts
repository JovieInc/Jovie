import { upgradeOAuthAvatarUrl } from '@/lib/utils/avatar-url';
import { normalizeEmail } from '@/lib/utils/email';

export interface ClerkEmailAddress {
  emailAddress?: string | null;
}

export interface ClerkPrivateMetadata {
  fullName?: string | null;
}

export interface ClerkUserIdentityInput {
  primaryEmailAddress?: ClerkEmailAddress | null;
  emailAddresses?: ClerkEmailAddress[] | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  privateMetadata?: ClerkPrivateMetadata | null;
}

export type ClerkDisplayNameSource =
  | 'private_metadata_full_name'
  | 'clerk_full_name'
  | 'clerk_name_parts'
  | 'clerk_first_name'
  | 'clerk_username'
  | 'email_local_part'
  | null;

export interface ClerkResolvedIdentity {
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  displayNameSource: ClerkDisplayNameSource;
}

function deriveDisplayNameFromEmail(email: string): string {
  if (!email.includes('@')) {
    return '';
  }

  const localPart = email.split('@').at(0) ?? '';
  return localPart.trim().replace(/[._-]+/g, ' ');
}

/**
 * Display name candidate with its source identifier.
 */
type DisplayNameCandidate = {
  value: string | null;
  source: ClerkDisplayNameSource;
};

/**
 * Resolve display name from candidates using priority order.
 * Returns the first non-empty candidate.
 */
function resolveDisplayName(candidates: DisplayNameCandidate[]): {
  displayName: string | null;
  source: ClerkDisplayNameSource;
} {
  for (const candidate of candidates) {
    if (candidate.value) {
      return { displayName: candidate.value, source: candidate.source };
    }
  }
  return { displayName: null, source: null };
}

export function resolveClerkIdentity(
  user: ClerkUserIdentityInput | null | undefined
): ClerkResolvedIdentity {
  const emailRaw =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  const email = emailRaw ? normalizeEmail(emailRaw) : null;

  const privateMetadataFullName = (
    user?.privateMetadata?.fullName ?? ''
  ).trim();
  const fullName = (user?.fullName ?? '').trim();
  const firstName = (user?.firstName ?? '').trim();
  const lastName = (user?.lastName ?? '').trim();

  const nameFromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  const username = (user?.username ?? '').trim();
  const derivedFromEmail = email ? deriveDisplayNameFromEmail(email) : null;

  // Priority-ordered candidates for display name resolution
  const candidates: DisplayNameCandidate[] = [
    {
      value: privateMetadataFullName || null,
      source: 'private_metadata_full_name',
    },
    { value: fullName || null, source: 'clerk_full_name' },
    { value: nameFromParts || null, source: 'clerk_name_parts' },
    { value: firstName || null, source: 'clerk_first_name' },
    { value: username || null, source: 'clerk_username' },
    { value: derivedFromEmail, source: 'email_local_part' },
  ];

  const { displayName, source: displayNameSource } =
    resolveDisplayName(candidates);

  // Upgrade OAuth provider avatar URLs to high resolution
  // Google OAuth returns 96x96 by default, we upgrade to 512x512
  const avatarUrl = upgradeOAuthAvatarUrl(user?.imageUrl);

  return {
    email,
    displayName,
    avatarUrl,
    displayNameSource,
  };
}
