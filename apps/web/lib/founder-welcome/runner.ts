import { createHash } from 'node:crypto';
import type { SummerCardInput } from '@/lib/ovie/summer-cards';
import {
  buildFounderWelcomeBody,
  buildFounderWelcomeEmail,
  cleanArtistName,
  FOUNDER_WELCOME_SUBJECT,
  FounderWelcomeBlocked,
  greetingName,
} from './email';

/**
 * Founder welcome runner: pure, every effect injected.
 *
 * One approval card per admitted visitor and wording, keyed by their waitlist
 * entry id plus a digest of the exact address and body. Approval is per card,
 * never per template: a send goes out only on the approved card filed for that
 * exact person and those exact words. If the words change (a renamed artist),
 * a fresh card is filed for Tim and the old approval sends nothing.
 */

/** A /start visitor the golden path admitted (`qualified_golden_path_resolved_artist`). */
export interface AdmittedVisitor {
  readonly entryId: string;
  readonly email: string;
  readonly firstName: string | null;
  readonly artistName: string | null;
  /** Their own page in the app; null when they own no claimed profile yet. */
  readonly pageUrl: string | null;
  readonly suppressed: boolean;
  /** Already got a founder welcome: the signup one or this one. */
  readonly alreadyWelcomed: boolean;
}

/** The parts of a filed card the runner checks before it sends. */
export interface FiledCard {
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly recipient: string | null;
  readonly body: string;
}

export interface FounderWelcomeLedger {
  /** Claims the one send for this entry; false when sent or in flight. */
  reserve(entryId: string, now: Date): Promise<boolean>;
  /** Gives the claim back after a send that did not go out. */
  release(entryId: string, now: Date): Promise<void>;
  markSent(entryId: string, now: Date): Promise<void>;
}

export interface FounderWelcomeSend {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly headers: Record<string, string>;
  /** Idempotency key of this person's own approved card. */
  readonly cardKey: string;
  readonly idempotencyKey: string;
}

export interface FounderWelcomeDeps {
  readonly visitors: readonly AdmittedVisitor[];
  readonly mailingAddress: string | null;
  readonly now: Date;
  readonly ledger: FounderWelcomeLedger;
  unsubscribeUrl(email: string): string | null;
  readCard(idempotencyKey: string): Promise<FiledCard | null>;
  fileCard(card: SummerCardInput): Promise<'filed' | 'conflict'>;
  send(email: FounderWelcomeSend): Promise<{ ok: boolean }>;
  /** Records the send where the signup welcome also looks, so it skips. */
  markWelcomed(entryId: string): Promise<void>;
}

type FounderWelcomeSkip =
  | 'suppressed'
  | 'already_welcomed'
  | 'no_claimed_profile'
  | 'no_artist_name'
  | 'card_conflict'
  | 'rejected'
  | 'card_mismatch'
  | 'already_sent'
  | 'blocked'
  | 'send_failed'
  | 'error';

interface FounderWelcomeResult {
  readonly held: 'compliance_mailing_address' | null;
  readonly sent: number;
  readonly cardsFiled: number;
  readonly awaitingApproval: number;
  readonly skipped: Readonly<Partial<Record<FounderWelcomeSkip, number>>>;
}

export function founderWelcomeCardKey(
  entryId: string,
  recipient: string,
  body: string
): string {
  const digest = createHash('sha256')
    .update(`${recipient}\n${body}`)
    .digest('hex')
    .slice(0, 12);
  return `founder-welcome-${entryId}-${digest}`;
}

/** The card Tim sees: exact recipient, subject and body. Silence never sends. */
export function buildFounderWelcomeCard(
  visitor: AdmittedVisitor & { readonly pageUrl: string },
  artistName: string
): SummerCardInput {
  const body = buildFounderWelcomeBody({
    firstName: visitor.firstName,
    artistName,
    link: visitor.pageUrl,
  });
  const who = greetingName(visitor.firstName) ?? artistName;
  return {
    idempotencyKey: founderWelcomeCardKey(visitor.entryId, visitor.email, body),
    kind: 'outbound',
    product: 'jov',
    title: `Welcome email to ${who}`.slice(0, 80),
    body: [
      `To: ${visitor.email}`,
      'From: Tim White',
      `Subject: ${FOUNDER_WELCOME_SUBJECT}`,
      '',
      body,
      '',
      'Below the signature the send adds the company postal address and a one click unsubscribe link.',
      'Approving sends this one email to this one person. It approves nothing else.',
    ].join('\n'),
    recommendation: 'Send',
    defaultIfSilent:
      'Not sent. Nothing goes out without your yes on this card.',
    recipient: visitor.email,
    amountUsd: null,
    preflightReceiptId: null,
    evidence: [],
    facts: [
      `To ${visitor.email}`.slice(0, 100),
      `Admitted artist: ${artistName}`.slice(0, 100),
      'Approving sends this one email only',
    ],
    decideBy: null,
    defaultDecision: null,
  };
}

export async function runFounderWelcome(
  deps: FounderWelcomeDeps
): Promise<FounderWelcomeResult> {
  const skipped: Partial<Record<FounderWelcomeSkip, number>> = {};
  const skip = (reason: FounderWelcomeSkip) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  let sent = 0;
  let cardsFiled = 0;
  let awaitingApproval = 0;
  const held = deps.mailingAddress?.trim()
    ? null
    : 'compliance_mailing_address';
  const seen = new Set<string>();

  const failures: unknown[] = [];
  for (const visitor of deps.visitors) {
    try {
      if (seen.has(visitor.entryId)) continue;
      seen.add(visitor.entryId);
      if (visitor.suppressed) {
        skip('suppressed');
        continue;
      }
      if (visitor.alreadyWelcomed) {
        skip('already_welcomed');
        continue;
      }
      const pageUrl = visitor.pageUrl;
      if (!pageUrl) {
        skip('no_claimed_profile');
        continue;
      }
      const artistName = cleanArtistName(visitor.artistName);
      if (!artistName) {
        skip('no_artist_name');
        continue;
      }

      const card = buildFounderWelcomeCard({ ...visitor, pageUrl }, artistName);
      const filed = await deps.readCard(card.idempotencyKey);
      if (!filed) {
        if ((await deps.fileCard(card)) === 'conflict') {
          skip('card_conflict');
          continue;
        }
        cardsFiled += 1;
        awaitingApproval += 1;
        continue;
      }
      if (filed.status === 'pending') {
        awaitingApproval += 1;
        continue;
      }
      if (filed.status === 'rejected') {
        skip('rejected');
        continue;
      }
      // Approved: only for this address and these words.
      if (filed.recipient !== visitor.email || filed.body !== card.body) {
        skip('card_mismatch');
        continue;
      }
      if (held) continue; // Approved, but nothing leaves without a postal address.

      if (!(await deps.ledger.reserve(visitor.entryId, deps.now))) {
        skip('already_sent');
        continue;
      }
      let delivered = false;
      try {
        const email = buildFounderWelcomeEmail({
          body: buildFounderWelcomeBody({
            firstName: visitor.firstName,
            artistName,
            link: pageUrl,
          }),
          mailingAddress: deps.mailingAddress,
          unsubscribeUrl: deps.unsubscribeUrl(visitor.email),
        });
        const result = await deps.send({
          to: visitor.email,
          ...email,
          cardKey: card.idempotencyKey,
          idempotencyKey: card.idempotencyKey,
        });
        delivered = result.ok;
        if (delivered) {
          // Stamp the shared marker before closing the claim: if the stamp
          // throws, the claim goes stale and a later run retries the send under
          // the same provider idempotency key (no second email) and the stamp.
          await deps.markWelcomed(visitor.entryId);
          await deps.ledger.markSent(visitor.entryId, deps.now);
          sent += 1;
        } else {
          skip('send_failed');
        }
      } catch (error) {
        if (!(error instanceof FounderWelcomeBlocked)) throw error;
        skip('blocked');
      } finally {
        if (!delivered) await deps.ledger.release(visitor.entryId, deps.now);
      }
    } catch (error) {
      // One visitor's failure never stops the rest of the pass.
      failures.push(error);
      skip('error');
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `founder welcome: ${failures.length} visitor(s) failed this pass`
    );
  }
  return { held, sent, cardsFiled, awaitingApproval, skipped };
}
