import 'server-only';
import { env } from '@/lib/env-server';
import { checkGateForUser } from '@/lib/flags/server';
import { normalizeEmail } from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';
import {
  getActiveSyntheticPrincipal,
  isSyntheticPrincipalEmail,
  type SyntheticPrincipal,
  type SyntheticPrincipalScenario,
} from './principals';

/**
 * Bot-protection passage for approved synthetic principals (JOV-7697).
 *
 * Passage is identity-bound, not request-bound. Every condition must hold:
 *
 *   1. a Better Auth session with a verified email, proven through the OTP
 *      round trip to the mailbox;
 *   2. that email's mailbox is exactly the Jovie-controlled canary mailbox
 *      base (`E2E_PROD_SIGNUP_EMAIL_BASE`). A `+synthetic-` tag on any other
 *      mailbox gets nothing;
 *   3. the tag names an active roster actor that is granted this scenario;
 *   4. the Statsig gate {@link SYNTHETIC_PASSAGE_GATE} is on for that user.
 *      It defaults off and fails closed, and it is the instant kill switch.
 *
 * Anonymous traffic never reaches this check, so public bot protection is
 * unchanged for everyone else. A granted passage selects Cloudflare's
 * official test mode and keeps all rate limits. It is logged with the
 * actor and scenario.
 *
 * Revocation: turn off the gate (instant), set the roster entry to
 * `revoked` (deploy), or rotate the mailbox base / revoke the actor's
 * sessions.
 */
export const SYNTHETIC_PASSAGE_GATE = 'synthetic_principal_passage';

export interface SyntheticPassageSession {
  readonly user: {
    readonly id: string;
    readonly email?: string | null;
    readonly emailVerified?: boolean | null;
  };
}

function mailboxOf(email: string): string | null {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;
  const local = normalized.slice(0, atIndex).split('+')[0];
  return local ? `${local}@${normalized.slice(atIndex + 1)}` : null;
}

/** True when the email's mailbox is exactly the configured canary base. */
export function isControlledSyntheticMailbox(
  email: string,
  mailboxBase: string | undefined
): boolean {
  if (!mailboxBase?.trim()) return false;
  const base = mailboxOf(mailboxBase);
  // The configured base must itself be untagged.
  if (!base || base !== normalizeEmail(mailboxBase)) return false;
  return mailboxOf(email) === base;
}

export async function resolveSyntheticPassage(
  session: SyntheticPassageSession | null | undefined,
  scenario: SyntheticPrincipalScenario,
  context: { readonly requestId?: string } = {}
): Promise<SyntheticPrincipal | null> {
  const user = session?.user;
  if (!user?.email || user.emailVerified !== true) return null;
  const mailboxBase = env.E2E_PROD_SIGNUP_EMAIL_BASE;
  if (!isControlledSyntheticMailbox(user.email, mailboxBase)) {
    // Abuse signal: a synthetic tag on a mailbox Jovie does not control.
    if (isSyntheticPrincipalEmail(user.email)) {
      logger.warn('[synthetic-passage] denied: uncontrolled mailbox', {
        userId: user.id,
        scenario,
        requestId: context.requestId,
      });
    }
    return null;
  }

  const principal = getActiveSyntheticPrincipal(user.email, scenario);
  if (!principal) return null;

  const gateOn = await checkGateForUser(user.id, SYNTHETIC_PASSAGE_GATE, false);
  if (!gateOn) {
    logger.info('[synthetic-passage] denied: gate off', {
      actorId: principal.actorId,
      scenario,
      requestId: context.requestId,
    });
    return null;
  }

  logger.info('[synthetic-passage] granted', {
    actorId: principal.actorId,
    producer: principal.producer,
    scenario,
    userId: user.id,
    requestId: context.requestId,
  });
  return principal;
}
