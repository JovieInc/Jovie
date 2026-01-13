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

  const displayName =
    privateMetadataFullName ||
    fullName ||
    nameFromParts ||
    firstName ||
    username ||
    derivedFromEmail;

  const displayNameSource: ClerkDisplayNameSource = privateMetadataFullName
    ? 'private_metadata_full_name'
    : fullName
      ? 'clerk_full_name'
      : nameFromParts
        ? 'clerk_name_parts'
        : firstName
          ? 'clerk_first_name'
          : username
            ? 'clerk_username'
            : derivedFromEmail
              ? 'email_local_part'
              : null;

  // Upgrade OAuth provider avatar URLs to high resolution
  // Google OAuth returns 96x96 by default, we upgrade to 512x512
  const avatarUrl = upgradeOAuthAvatarUrl(user?.imageUrl);

  return {
    email,
    displayName: displayName || null,
    avatarUrl,
    displayNameSource,
  };
}
