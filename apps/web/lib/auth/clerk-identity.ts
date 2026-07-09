import 'server-only';

import { upgradeOAuthAvatarUrl } from '@/lib/utils/avatar-url';
import { normalizeEmail } from '@/lib/utils/email';

export interface ClerkEmailAddress {
  emailAddress?: string | null;
  verification?: { status?: string | null } | null;
}

export function selectVerifiedClerkEmail(
  emailAddresses: ReadonlyArray<ClerkEmailAddress> | null | undefined
): string | null {
  return (
    emailAddresses?.find(e => e.verification?.status === 'verified')
      ?.emailAddress ?? null
  );
}

export interface ClerkPrivateMetadata {
  fullName?: string | null;
}

export interface ClerkExternalAccount {
  provider?: string | null;
  username?: string | null;
}

export interface ClerkUserIdentityInput {
  primaryEmailAddress?: ClerkEmailAddress | null;
  emailAddresses?: ReadonlyArray<ClerkEmailAddress> | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  externalAccounts?: ClerkExternalAccount[] | null;
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
  spotifyUsername: string | null;
  displayNameSource: ClerkDisplayNameSource;
}

function resolveSpotifyUsername(
  externalAccounts: ClerkExternalAccount[] | null | undefined
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
  const candidates: readonly [string | null, ClerkDisplayNameSource][] = [
    [privateMetadataFullName || null, 'private_metadata_full_name'],
    [fullName || null, 'clerk_full_name'],
    [nameFromParts || null, 'clerk_name_parts'],
    [firstName || null, 'clerk_first_name'],
    [username || null, 'clerk_username'],
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
