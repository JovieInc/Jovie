import 'server-only';

import { upgradeOAuthAvatarUrl } from '@/lib/utils/avatar-url';
import { normalizeEmail } from '@/lib/utils/email';

export interface UserEmailAddress {
  emailAddress?: string | null;
  verification?: { status?: string | null } | null;
}

export function selectVerifiedUserEmail(
  emailAddresses: ReadonlyArray<UserEmailAddress> | null | undefined
): string | null {
  return (
    emailAddresses?.find(e => e.verification?.status === 'verified')
      ?.emailAddress ?? null
  );
}

export interface UserPrivateMetadata {
  fullName?: string | null;
}

export interface UserExternalAccount {
  provider?: string | null;
  username?: string | null;
}

export interface UserIdentityInput {
  primaryEmailAddress?: UserEmailAddress | null;
  emailAddresses?: ReadonlyArray<UserEmailAddress> | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  externalAccounts?: UserExternalAccount[] | null;
  privateMetadata?: UserPrivateMetadata | null;
}

export type UserDisplayNameSource =
  | 'private_metadata_full_name'
  | 'user_full_name'
  | 'user_name_parts'
  | 'user_first_name'
  | 'user_username'
  | 'email_local_part'
  | null;

export interface ResolvedUserIdentity {
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  spotifyUsername: string | null;
  displayNameSource: UserDisplayNameSource;
}

function resolveSpotifyUsername(
  externalAccounts: UserExternalAccount[] | null | undefined
): string | null {
  if (!externalAccounts?.length) return null;
  const spotifyAccount = externalAccounts.find(account =>
    (account.provider ?? '').toLowerCase().includes('spotify')
  );
  return spotifyAccount?.username?.trim() || null;
}

function deriveDisplayNameFromEmail(email: string): string {
  const localPart = email.split('@').at(0) ?? '';
  return localPart.trim().replaceAll(/[._-]+/g, ' ');
}

export function resolveUserIdentity(
  user: UserIdentityInput | null | undefined
): ResolvedUserIdentity {
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
  const candidates: readonly [string | null, UserDisplayNameSource][] = [
    [privateMetadataFullName || null, 'private_metadata_full_name'],
    [fullName || null, 'user_full_name'],
    [nameFromParts || null, 'user_name_parts'],
    [firstName || null, 'user_first_name'],
    [username || null, 'user_username'],
    [derivedFromEmail, 'email_local_part'],
  ];
  const match = candidates.find(([value]) => value);

  return {
    email,
    displayName: match?.[0] ?? null,
    avatarUrl: upgradeOAuthAvatarUrl(user?.imageUrl),
    spotifyUsername: resolveSpotifyUsername(user?.externalAccounts),
    displayNameSource: match?.[1] ?? null,
  };
}
