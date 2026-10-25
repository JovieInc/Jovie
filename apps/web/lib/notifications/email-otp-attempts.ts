import { and, sql as drizzleSql, eq, gt, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';

/** Wrong guesses allowed per sent code (10^6 codes, 10 minute TTL). */
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

interface CurrentEmailOtp {
  /** Subscription row id. */
  readonly id: string;
  /** The code hash read with the row; ties every write to that exact code. */
  readonly emailOtpHash: string;
}

function isCurrentCode(otp: CurrentEmailOtp) {
  return and(
    eq(notificationSubscriptions.id, otp.id),
    eq(notificationSubscriptions.emailOtpHash, otp.emailOtpHash)
  );
}

/**
 * Spend one verification attempt atomically, before comparing the code.
 * Returns false when the code is expired, replaced, or out of attempts.
 *
 * Never write back `attempts + 1` from a value read earlier: concurrent
 * guesses all read the same count and the cap stops holding
 * (tests/unit/security/credential-attempt-counters.test.ts).
 */
export async function spendEmailOtpAttempt(
  otp: CurrentEmailOtp,
  now: Date
): Promise<boolean> {
  const [spent] = await db
    .update(notificationSubscriptions)
    .set({
      emailOtpAttempts: drizzleSql`${notificationSubscriptions.emailOtpAttempts} + 1`,
    })
    .where(
      and(
        isCurrentCode(otp),
        gt(notificationSubscriptions.emailOtpExpiresAt, now),
        lt(notificationSubscriptions.emailOtpAttempts, EMAIL_OTP_MAX_ATTEMPTS)
      )
    )
    .returning({ id: notificationSubscriptions.id });
  return Boolean(spent);
}

/**
 * Confirm the subscription and consume exactly this code. Returns false when
 * a concurrent request already consumed it or a new code replaced it.
 */
export async function consumeEmailOtp(
  otp: CurrentEmailOtp,
  now: Date
): Promise<boolean> {
  const [consumed] = await db
    .update(notificationSubscriptions)
    .set({
      confirmedAt: now,
      confirmationToken: null,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      emailOtpAttempts: 0,
    })
    .where(isCurrentCode(otp))
    .returning({ id: notificationSubscriptions.id });
  return Boolean(consumed);
}
