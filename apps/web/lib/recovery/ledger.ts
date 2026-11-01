import type { RecordBackend } from '@/lib/ovie/mcp/store';
import { MAX_RECOVERY_EMAILS_PER_USER } from './registry';

/** Per-send record; every stage is a machine timestamp (p50/p95 per stage). */
export interface RecoveryRecord {
  readonly id: string;
  readonly userId: string;
  readonly fixId: string;
  readonly templateClass: string;
  readonly createdAt: string;
  readonly sentAt: string | null;
  readonly openedAt: string | null;
  readonly clickedAt: string | null;
  readonly returnedAt: string | null;
  readonly completedStepAt: string | null;
  readonly claimedAt: string | null;
  readonly paidAt: string | null;
}

/** setIfAbsent ttl: effectively permanent (the Postgres backend ignores it). */
const FOREVER_S = 10 * 365 * 24 * 3600;
const REC = 'recovery:rec:';
const SLOT = 'recovery:slot:';
const TEMPLATE = 'recovery:template-approved:';
const HISTORY = 'recovery:hist:';

export const recordKey = (userId: string, fixId: string) =>
  `${REC}${userId}:${fixId}`;

export function createLedger(backend: RecordBackend) {
  return {
    async history(userId: string, fixIds: readonly string[]) {
      const sent: string[] = [];
      for (const fixId of fixIds) {
        if (await backend.get(recordKey(userId, fixId))) sent.push(fixId);
      }
      const slots = await Promise.all(
        Array.from({ length: MAX_RECOVERY_EMAILS_PER_USER }, (_, i) =>
          backend.get(`${SLOT}${userId}:${i + 1}`)
        )
      );
      return { fixIdsSent: sent, totalSent: slots.filter(Boolean).length };
    },

    /**
     * Reserves (user, fix) once and one of the user's two lifetime slots.
     * Returns null when either is taken, so concurrent runs cannot double-send.
     */
    async reserve(
      userId: string,
      fixId: string,
      templateClass: string,
      now: Date
    ): Promise<RecoveryRecord | null> {
      const record: RecoveryRecord = {
        id: crypto.randomUUID(),
        userId,
        fixId,
        templateClass,
        createdAt: now.toISOString(),
        sentAt: null,
        openedAt: null,
        clickedAt: null,
        returnedAt: null,
        completedStepAt: null,
        claimedAt: null,
        paidAt: null,
      };
      if (
        !(await backend.setIfAbsent(
          recordKey(userId, fixId),
          record,
          FOREVER_S
        ))
      ) {
        return null;
      }
      for (let slot = 1; slot <= MAX_RECOVERY_EMAILS_PER_USER; slot += 1) {
        if (
          await backend.setIfAbsent(
            `${SLOT}${userId}:${slot}`,
            record.id,
            FOREVER_S
          )
        ) {
          await backend.set(`${HISTORY}${record.id}`, recordKey(userId, fixId));
          return record;
        }
      }
      return null;
    },

    async markSent(record: RecoveryRecord, now: Date) {
      await backend.set(recordKey(record.userId, record.fixId), {
        ...record,
        sentAt: now.toISOString(),
      });
    },

    async update(record: RecoveryRecord) {
      await backend.set(recordKey(record.userId, record.fixId), record);
    },

    async isTemplateApproved(templateClass: string) {
      return (await backend.get(`${TEMPLATE}${templateClass}`)) !== null;
    },

    /** Records the approval and the card that granted it (the gateway re-checks that card). */
    async approveTemplate(templateClass: string, now: Date, cardKey?: string) {
      await backend.set(`${TEMPLATE}${templateClass}`, {
        approvedAt: now.toISOString(),
        ...(cardKey && { cardKey }),
      });
    },

    /** Idempotency key of the Ovie card that approved this template class. */
    async templateApprovalKey(templateClass: string): Promise<string | null> {
      const row = (await backend.get(`${TEMPLATE}${templateClass}`)) as {
        cardKey?: string;
      } | null;
      return row?.cardKey ?? null;
    },

    async listRecords(): Promise<RecoveryRecord[]> {
      if (!backend.listRecords) return [];
      const out: RecoveryRecord[] = [];
      let after: string | undefined;
      for (;;) {
        const page = await backend.listRecords(REC, after, 100);
        for (const row of page) out.push(row.value as RecoveryRecord);
        if (page.length < 100) return out;
        after = page.at(-1)?.key;
      }
    },
  };
}

export type RecoveryLedger = ReturnType<typeof createLedger>;
