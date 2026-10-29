import { isInternalOrTestAccountEmail } from '@/lib/utils/email';
import { type KnownBadFlowFix, MAX_RECOVERY_EMAILS_PER_USER } from './registry';

export interface StalledUser {
  readonly userId: string;
  readonly firstName: string | null;
  readonly email: string;
  readonly stalledStep: string;
  readonly stalledAt: Date;
  /** The person's real, ready page or step. Null means nothing is ready. */
  readonly readyUrl: string | null;
  readonly suppressed: boolean;
  /** Replay flush trigger when known (onboarding_stalled, claim_left, ...). */
  readonly flushTrigger?: string | null;
}

export type SkipReason =
  | 'fix_not_live'
  | 'internal_account'
  | 'suppressed'
  | 'no_email'
  | 'stalled_after_fix'
  | 'already_sent_for_fix'
  | 'recovery_cap_reached'
  | 'nothing_ready';

export type Decision =
  | { readonly eligible: true; readonly fix: KnownBadFlowFix }
  | { readonly eligible: false; readonly reason: SkipReason };

export interface UserHistory {
  readonly fixIdsSent: readonly string[];
  readonly totalSent: number;
}

/**
 * A user is eligible when they stalled at the fix's step BEFORE the fix went
 * live, the fix is certified live now, and no cap or suppression applies.
 * `liveFixes` (fix id to observed deploy time) comes from the gate, never
 * from the registry alone.
 */
export function decide(
  user: StalledUser,
  fix: KnownBadFlowFix,
  liveFixes: ReadonlyMap<string, string>,
  history: UserHistory
): Decision {
  const no = (reason: SkipReason): Decision => ({ eligible: false, reason });
  if (!user.email) return no('no_email');
  const deployedAt = liveFixes.get(fix.id);
  if (!deployedAt) return no('fix_not_live');
  if (isInternalOrTestAccountEmail(user.email)) return no('internal_account');
  if (user.suppressed) return no('suppressed');
  if (user.stalledAt.getTime() >= new Date(deployedAt).getTime()) {
    return no('stalled_after_fix');
  }
  if (history.fixIdsSent.includes(fix.id)) return no('already_sent_for_fix');
  if (history.totalSent >= MAX_RECOVERY_EMAILS_PER_USER) {
    return no('recovery_cap_reached');
  }
  if (!user.readyUrl) return no('nothing_ready');
  return { eligible: true, fix };
}

/** The first fix matching the user's stalled step. One email per run. */
export function fixForUser(
  user: StalledUser,
  fixes: readonly KnownBadFlowFix[]
): KnownBadFlowFix | null {
  return fixes.find(fix => fix.step === user.stalledStep) ?? null;
}
