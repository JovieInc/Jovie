import { normalizeEmail } from '@/lib/utils/email';

export interface ClerkEmailAddress {
  emailAddress?: string | null;
}

export interface ClerkUserIdentityInput {
  primaryEmailAddress?: ClerkEmailAddress | null;
  emailAddresses?: ClerkEmailAddress[] | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
}

export interface ClerkResolvedIdentity {
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

function deriveDisplayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';
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

  const fullName = (user?.fullName ?? '').trim();
  const firstName = (user?.firstName ?? '').trim();
  const lastName = (user?.lastName ?? '').trim();

  const nameFromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  const username = (user?.username ?? '').trim();

  const displayName =
    fullName ||
    nameFromParts ||
    firstName ||
    username ||
    (email ? deriveDisplayNameFromEmail(email) : null);

  const avatarUrl = user?.imageUrl ?? null;

  return {
    email,
    displayName: displayName || null,
    avatarUrl,
  };
}
