import { createHash } from 'node:crypto';
import type { SummerCardInput } from '@/lib/ovie/summer-cards';
import {
  buildRecoveryBody,
  buildRecoveryEmail,
  type RecoveryEmail,
  RecoveryEmailBlocked,
} from './email';
import { certifyFix, type FixCertifier } from './gate';
import type { RecoveryLedger } from './ledger';
import {
  decide,
  fixForUser,
  type SkipReason,
  type StalledUser,
} from './policy';
import type { KnownBadFlowFix } from './registry';

export type CardStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface RunnerDeps {
  readonly fixes: readonly KnownBadFlowFix[];
  readonly users: readonly StalledUser[];
  readonly certifier: FixCertifier;
  readonly ledger: RecoveryLedger;
  readonly mailingAddress: string | null;
  readonly now: Date;
  send(
    email: RecoveryEmail,
    to: string,
    idempotencyKey: string,
    /** Idempotency key of the approving Ovie card; the gateway re-checks it. */
    approvalKey: string | null
  ): Promise<{ ok: boolean }>;
  cardStatus(idempotencyKey: string): Promise<CardStatus>;
  fileCard(card: SummerCardInput): Promise<void>;
}

export interface RunResult {
  readonly held: 'compliance_mailing_address' | null;
  readonly sent: number;
  readonly cardsFiled: number;
  readonly awaitingApproval: number;
  readonly skipped: Readonly<
    Partial<Record<SkipReason | 'rejected' | 'send_failed', number>>
  >;
}

export function cardKey(fixId: string, userId: string): string {
  const digest = createHash('sha256').update(userId).digest('hex').slice(0, 24);
  return `recovery-${fixId}-${digest}`;
}

function firstNameOf(user: StalledUser): string {
  return user.firstName?.trim().split(/\s+/u)[0] || 'there';
}

/** The approval card Tim sees: exact body, no address, default is not-sent. */
export function buildApprovalCard(
  user: StalledUser,
  fix: KnownBadFlowFix,
  readyUrl: string
): SummerCardInput {
  const body = buildRecoveryBody({ fix, firstName: user.firstName }, readyUrl);
  return {
    idempotencyKey: cardKey(fix.id, user.userId),
    kind: 'outbound',
    product: 'jov',
    title: `Recovery email to ${firstNameOf(user)} (${fix.issue})`,
    body: `Subject: A hiccup when you signed up\nFrom: Tim White\nReply-to: Tim\n\n${body}\n\nApproving this also approves this template class (${fix.templateClass}): later sends of the same class go out automatically, capped at one per person per fix and two per person ever.`,
    recommendation: 'Send',
    defaultIfSilent: 'Not sent. Nothing goes to a real person without a yes.',
    recipient: firstNameOf(user),
    amountUsd: null,
    preflightReceiptId: null,
    evidence: [],
    decideBy: null,
    defaultDecision: null,
  };
}

export async function runRecovery(deps: RunnerDeps): Promise<RunResult> {
  const live = new Map<string, string>();
  for (const fix of deps.fixes) {
    const cert = await certifyFix(fix, deps.certifier);
    if (cert.live && cert.deployedAt) live.set(fix.id, cert.deployedAt);
  }
  const skipped: Partial<
    Record<SkipReason | 'rejected' | 'send_failed', number>
  > = {};
  const skip = (reason: SkipReason | 'rejected' | 'send_failed') => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  let sent = 0;
  let cardsFiled = 0;
  let awaitingApproval = 0;
  const held = deps.mailingAddress?.trim()
    ? null
    : 'compliance_mailing_address';

  for (const user of deps.users) {
    const fix = fixForUser(user, deps.fixes);
    if (!fix) continue;
    const history = await deps.ledger.history(
      user.userId,
      deps.fixes.map(f => f.id)
    );
    const decision = decide(user, fix, live, history);
    if (!decision.eligible) {
      skip(decision.reason);
      continue;
    }
    const readyUrl = user.readyUrl as string;

    let approved = await deps.ledger.isTemplateApproved(fix.templateClass);
    let approvalKey = approved
      ? await deps.ledger.templateApprovalKey(fix.templateClass)
      : null;
    if (!approved) {
      const key = cardKey(fix.id, user.userId);
      const status = await deps.cardStatus(key);
      if (status === 'none') {
        await deps.fileCard(buildApprovalCard(user, fix, readyUrl));
        cardsFiled += 1;
        awaitingApproval += 1;
        continue;
      }
      if (status === 'pending') {
        awaitingApproval += 1;
        continue;
      }
      if (status === 'rejected') {
        skip('rejected');
        continue;
      }
      await deps.ledger.approveTemplate(fix.templateClass, deps.now, key);
      approvalKey = key;
      approved = true;
    }

    if (held) continue; // Built and approved, but nothing leaves without a postal address.

    const record = await deps.ledger.reserve(
      user.userId,
      fix.id,
      fix.templateClass,
      deps.now
    );
    if (!record) {
      skip('already_sent_for_fix');
      continue;
    }
    try {
      const email = buildRecoveryEmail({
        fix,
        firstName: user.firstName,
        email: user.email,
        readyUrl,
        recordId: record.id,
        mailingAddress: deps.mailingAddress,
      });
      const result = await deps.send(email, user.email, record.id, approvalKey);
      if (!result.ok) {
        skip('send_failed');
        continue;
      }
      await deps.ledger.markSent(record, deps.now);
      sent += 1;
    } catch (error) {
      if (!(error instanceof RecoveryEmailBlocked)) throw error;
      skip('send_failed');
    }
  }
  return { held, sent, cardsFiled, awaitingApproval, skipped };
}
