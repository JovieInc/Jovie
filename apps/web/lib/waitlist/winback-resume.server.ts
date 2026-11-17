import 'server-only';

/**
 * Win-back resume-link verification (/start?resume=winback&w=<token>) —
 * founder dispatch 2026-11-09. The signed token is a high-entropy value
 * minted with the held draft and stored hashed in the operating ledger;
 * /start verifies it here to land the artist in setup even while public
 * signup is closed. An unknown token keeps the closed-signup redirect in
 * force; a failed lookup never blocks the page.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import { hashWaitlistInviteToken } from '@/lib/waitlist/tokens';
import { winbackResumeKvKey } from '@/lib/waitlist/winback';
import { trackWinbackEvent } from '@/lib/waitlist/winback-analytics';
import { readKvJson } from '@/lib/waitlist/winback-signals.server';

export interface WinbackResumeRecord {
  readonly entryId: string;
  readonly batchId: string;
  readonly capabilityKey: string;
}

/**
 * Verify a raw resume token against the operating ledger. Returns null when
 * the token is unknown — the caller keeps the closed-signup redirect in
 * force. Never throws.
 */
export async function resolveWinbackResumeToken(
  rawToken: string
): Promise<WinbackResumeRecord | null> {
  try {
    const key = winbackResumeKvKey(hashWaitlistInviteToken(rawToken));
    const value = await readKvJson(db, key);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const entryId = record.entryId;
    const batchId = record.batchId;
    const capabilityKey = record.capabilityKey;
    if (
      typeof entryId !== 'string' ||
      typeof batchId !== 'string' ||
      typeof capabilityKey !== 'string'
    ) {
      return null;
    }
    return { entryId, batchId, capabilityKey };
  } catch (error) {
    logger.warn('[winback] resume token verification failed', { error });
    return null;
  }
}

/** Best-effort click tracking for a verified resume token. Never throws. */
export async function recordWinbackResumeClick(
  resume: WinbackResumeRecord
): Promise<void> {
  try {
    await trackWinbackEvent('winback_clicked', {
      entry_id: resume.entryId,
      capability_key: resume.capabilityKey,
      batch_id: resume.batchId,
      winback_cohort: 'resume_click',
    });
  } catch (error) {
    logger.warn('[winback] resume click tracking failed', { error });
  }
}
