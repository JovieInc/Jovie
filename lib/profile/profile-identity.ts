'use client';

export interface ProfileIdentityInput {
  profileUsername?: string | null;
  profileDisplayName?: string | null;
  artistHandle?: string | null;
  artistName?: string | null;
}

export interface ProfileIdentity {
  username: string;
  displayName: string;
  profilePath: string;
}

export function getProfileIdentity(
  input: ProfileIdentityInput
): ProfileIdentity {
  const fallbackUsername = 'username';

  const rawUsername = (
    input.profileUsername ??
    input.artistHandle ??
    fallbackUsername
  ).trim();

  const username = (
    rawUsername.startsWith('@') ? rawUsername.slice(1) : rawUsername
  ).trim();

  const safeUsername = username.length > 0 ? username : fallbackUsername;

  const rawDisplayName = (
    input.profileDisplayName ??
    input.artistName ??
    safeUsername
  ).trim();

  const safeDisplayName =
    rawDisplayName.length > 0 ? rawDisplayName : safeUsername;

  return {
    username: safeUsername,
    displayName: safeDisplayName,
    profilePath: `/${safeUsername}`,
  };
}
