import 'server-only';

import { APIError } from 'better-auth/api';
import {
  and,
  sql as drizzleSql,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
} from 'drizzle-orm';
import { dogfoodAdmissionAudit } from '@/lib/accounts/dogfood-account';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { isProdcertCanaryEmail } from '@/lib/synthetic/prodcert-identities';
import { getEmailDomain, normalizeEmail } from '@/lib/utils/email';

/**
 * Public account creation stays closed, across OTP and OAuth alike. This hook
 * runs only for new Better Auth identities; existing-user sign-in is unchanged.
 * Recipient ownership must already be proven by Better Auth's OTP/provider.
 * The issued invitation remains subject to token redemption after sign-in.
 */
export async function assertNewAccountAdmission(user: {
  email: string;
  emailVerified: boolean;
}): Promise<void> {
  const deny = (reason: 'email_unverified' | 'no_active_invitation') => {
    // The OTP is already consumed when this runs, and the client sees only a
    // 403. Log every denial (domain only, never the address) so a blocked
    // sign-in is visible in runtime logs (2026-11-09 sign-in incident).
    console.warn(
      `[auth] new account denied ${JSON.stringify({
        code: 'SIGNUP_INVITE_REQUIRED',
        reason,
        emailDomain: getEmailDomain(user.email) ?? 'unknown',
      })}`
    );
    throw new APIError('FORBIDDEN', {
      code: 'SIGNUP_INVITE_REQUIRED',
      message: 'An active invitation is required to create an account.',
    });
  };

  if (user.emailVerified !== true) deny('email_unverified');
  const email = normalizeEmail(user.email);

  // Production canaries prove ownership with the same random OTP as users.
  // This existing predicate does not grant a deterministic production OTP.
  if (isProdcertCanaryEmail(email)) return;

  // Founder dogfood mailboxes live on the founder's own domain, whose
  // catch-all only he reads, so the verified OTP above proves it is him.
  // Audited server-side with the domain only, never the address.
  const dogfood = dogfoodAdmissionAudit(user.email);
  if (dogfood) {
    console.info(`[auth] dogfood account admitted ${JSON.stringify(dogfood)}`);
    return;
  }

  // Never use the cached post-auth gate here: pending/noncanonical entries,
  // expired/redeemed invitations and revoked approval cannot admit a user.
  // Storage failures propagate before Better Auth writes a user or session.
  const [invitation] = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.emailNormalized, email),
        eq(waitlistEntries.canonical, true),
        inArray(waitlistEntries.status, ['invited', 'approved']),
        isNotNull(waitlistEntries.inviteTokenHash),
        ne(waitlistEntries.inviteTokenHash, ''),
        gt(waitlistEntries.inviteTokenExpiresAt, new Date()),
        isNull(waitlistEntries.inviteTokenRedeemedAt)
      )
    )
    .limit(1);

  if (invitation) return;

  // Preserve the existing verified-email adoption of approved app-only users.
  // A pending, deleted or already-linked app row is not migration authority.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        drizzleSql`lower(${users.email}) = ${email}`,
        isNull(users.betterAuthUserId),
        isNull(users.deletedAt),
        inArray(users.userStatus, [
          'waitlist_approved',
          'profile_claimed',
          'onboarding_incomplete',
          'active',
        ])
      )
    )
    .limit(1);

  if (!existingUser) deny('no_active_invitation');
}
