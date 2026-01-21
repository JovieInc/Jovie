/**
 * Profile Update Context
 *
 * Builds context objects for profile updates from parsed input.
 */

import type { ProfileUpdateInput } from './validation';

export interface ProfileUpdateContext {
  dbProfileUpdates: Record<string, unknown>;
  displayNameForUserUpdate: string | undefined;
  avatarUrl: string | undefined;
  usernameUpdate: string | undefined;
}

export function buildProfileUpdateContext(
  parsedUpdates: ProfileUpdateInput
): ProfileUpdateContext {
  const { username: usernameFromUpdates, ...profileUpdates } = parsedUpdates;
  const sanitizedProfileUpdates = Object.fromEntries(
    Object.entries(profileUpdates).filter(([, value]) => value !== undefined)
  );

  const dbProfileUpdates = { ...sanitizedProfileUpdates } as Record<
    string,
    unknown
  >;

  if (Object.hasOwn(dbProfileUpdates, 'venmo_handle')) {
    dbProfileUpdates.venmoHandle = dbProfileUpdates.venmo_handle;
    delete dbProfileUpdates.venmo_handle;
  }

  const displayNameForUserUpdate =
    typeof profileUpdates.displayName === 'string'
      ? profileUpdates.displayName.trim()
      : undefined;

  const avatarUrl =
    typeof profileUpdates.avatarUrl === 'string'
      ? profileUpdates.avatarUrl
      : undefined;

  const usernameUpdate =
    typeof usernameFromUpdates === 'string' ? usernameFromUpdates : undefined;

  return {
    dbProfileUpdates,
    displayNameForUserUpdate,
    avatarUrl,
    usernameUpdate,
  };
}

export function buildClerkUpdates(
  displayName?: string
): Record<string, unknown> {
  if (!displayName) {
    return {};
  }

  const trimmed = displayName.trim();
  if (!trimmed) {
    return {};
  }

  const nameParts = trimmed.split(' ');
  const firstName = nameParts.shift() ?? trimmed;
  const lastName = nameParts.join(' ').trim();

  return {
    firstName,
    lastName: lastName || undefined,
  };
}
