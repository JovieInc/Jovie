/**
 * Mutation-sensitive tests for the SMS webhook command dispatcher, focused on
 * the TCPA-critical STOP -> opt-out persistence path.
 *
 * `handleVerifiedInbound` / `handleStopCommand` (sms-webhook.ts) delegate the
 * actual database mutation to `suppressPhoneForStop` (sms-suppression.ts).
 * These tests exercise that REAL persistence code path (not mocked away) with
 * a mocked `@/lib/db` transaction so assertions target the actual mutation
 * payload and WHERE targeting — which columns are set, and which row is
 * targeted — rather than merely confirming a mock was invoked.
 *
 * Per source comments in sms-webhook.ts (codex F15 / decision row #40), STOP
 * must persist the opt-out regardless of the native SMS feature flag. That
 * invariant is asserted explicitly below.
 */
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTxInsert = vi.hoisted(() => vi.fn());
const mockTxInsertValues = vi.hoisted(() => vi.fn());
const mockTxInsertOnConflictDoUpdate = vi.hoisted(() => vi.fn());
const mockTxInsertReturning = vi.hoisted(() => vi.fn());
const mockTxUpdate = vi.hoisted(() => vi.fn());
const mockTxUpdateSet = vi.hoisted(() => vi.fn());
const mockTxUpdateWhere = vi.hoisted(() => vi.fn());
const mockDbTransaction = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    transaction: mockDbTransaction,
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureError: mockCaptureError,
}));

import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { notificationContacts } from '@/lib/db/schema/notifications';
import type { InboundSmsMessage } from '@/lib/notifications/providers/sms/types';
import {
  HELP_REPLY_TEXT,
  STOP_REPLY_TEXT,
} from '@/lib/notifications/sms-commands';
import { hashPhoneE164 } from '@/lib/notifications/sms-suppression';
import { handleVerifiedInbound } from '@/lib/notifications/sms-webhook';

const TEST_PHONE = '+15551234567';

function makeMessage(
  body: string,
  overrides: Partial<InboundSmsMessage> = {}
): InboundSmsMessage {
  return {
    provider: 'twilio',
    messageId: 'evt-1',
    fromPhone: TEST_PHONE,
    toPhone: '+15559998888',
    body,
    ...overrides,
  };
}

/**
 * Wires the tx chain used by `suppressPhoneForStop`:
 *   tx.insert(notificationContacts).values(...).onConflictDoUpdate(...).returning(...)
 *   tx.update(notificationSubscriptions).set(...).where(...)
 */
function buildTx() {
  mockTxInsertReturning.mockResolvedValue([{ id: 'contact-1' }]);
  mockTxInsertOnConflictDoUpdate.mockReturnValue({
    returning: mockTxInsertReturning,
  });
  mockTxInsertValues.mockReturnValue({
    onConflictDoUpdate: mockTxInsertOnConflictDoUpdate,
  });
  mockTxInsert.mockReturnValue({ values: mockTxInsertValues });

  mockTxUpdateWhere.mockResolvedValue(undefined);
  mockTxUpdateSet.mockReturnValue({ where: mockTxUpdateWhere });
  mockTxUpdate.mockReturnValue({ set: mockTxUpdateSet });

  return { insert: mockTxInsert, update: mockTxUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  const tx = buildTx();
  mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(tx)
  );
});

describe('handleVerifiedInbound — STOP command persistence (F15 / decision row #40)', () => {
  it('persists opt-out: flips notification_contacts.smsStatus and cascades unsubscribedAt on active SMS subscriptions', async () => {
    const message = makeMessage('STOP');

    const result = await handleVerifiedInbound({
      verified: {
        message,
        rawBody: 'From=%2B15551234567&Body=STOP',
        providerEventId: 'evt-stop-1',
        keyUsed: 'primary',
      },
      webhookEventId: 'wh-1',
      nativeSmsEnabled: true,
    });

    expect(result).toEqual({
      status: 200,
      kind: 'stop_applied',
      outboundReply: { to: TEST_PHONE, body: STOP_REPLY_TEXT },
    });

    // The transaction actually ran (not short-circuited).
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);

    // Contact upsert targets the normalized phone + its stable hash, and
    // records the provider event / raw command that triggered the STOP.
    expect(mockTxInsert).toHaveBeenCalledWith(notificationContacts);
    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: TEST_PHONE,
        phoneHash: hashPhoneE164(TEST_PHONE),
        smsStatus: 'stopped',
        firstSource: 'twilio_inbound_stop',
        metadata: {
          stopProviderEventId: 'evt-stop-1',
          stopRawCommand: 'STOP',
        },
      })
    );

    // Conflict path (an existing contact row) must also downgrade smsStatus
    // to 'stopped' and bump updatedAt — asserting the real target + set
    // shape, not just that onConflictDoUpdate was called with *something*.
    expect(mockTxInsertOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: notificationContacts.phoneHash,
        targetWhere: drizzleSql`${notificationContacts.phoneHash} IS NOT NULL`,
        set: expect.objectContaining({
          smsStatus: drizzleSql`CASE WHEN ${notificationContacts.smsStatus} = 'blocked' THEN ${notificationContacts.smsStatus} ELSE 'stopped' END`,
          updatedAt: expect.any(Date),
        }),
      })
    );

    // Cascade: every active SMS notification_subscriptions row for this
    // phone gets unsubscribedAt stamped. Assert the exact table, the exact
    // set payload, and the exact WHERE targeting (phone + sms channel +
    // still-active rows only) — this is the row-scoping a mutation to the
    // wrong phone/channel/already-unsubscribed row would violate.
    expect(mockTxUpdate).toHaveBeenCalledWith(notificationSubscriptions);
    expect(mockTxUpdateSet).toHaveBeenCalledWith({
      unsubscribedAt: expect.any(Date),
    });
    expect(mockTxUpdateWhere).toHaveBeenCalledWith(
      and(
        eq(notificationSubscriptions.phone, TEST_PHONE),
        eq(notificationSubscriptions.channel, 'sms'),
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`
      )
    );
  });

  it('persists the opt-out even when the native SMS feature flag is disabled (flag-independent TCPA invariant)', async () => {
    const message = makeMessage('STOP');

    const result = await handleVerifiedInbound({
      verified: {
        message,
        rawBody: 'From=%2B15551234567&Body=STOP',
        providerEventId: 'evt-stop-flagoff',
        keyUsed: 'primary',
      },
      webhookEventId: 'wh-2',
      // The one thing this test exists to prove: STOP must not be gated by
      // the native SMS rollout flag. If a future change made STOP check
      // `nativeSmsEnabled` (mirroring the JOIN command's gate), this
      // assertion set would fail because the mutation would never run.
      nativeSmsEnabled: false,
    });

    expect(result.status).toBe(200);
    expect(result.kind).toBe('stop_applied');

    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: TEST_PHONE,
        smsStatus: 'stopped',
      })
    );
    expect(mockTxUpdateWhere).toHaveBeenCalledWith(
      and(
        eq(notificationSubscriptions.phone, TEST_PHONE),
        eq(notificationSubscriptions.channel, 'sms'),
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`
      )
    );
  });

  it('is idempotent: a repeat STOP from the same phone applies the same upsert/cascade again without erroring', async () => {
    const firstMessage = makeMessage('STOP', { messageId: 'evt-a' });
    const firstResult = await handleVerifiedInbound({
      verified: {
        message: firstMessage,
        rawBody: 'From=%2B15551234567&Body=STOP',
        providerEventId: 'evt-a',
        keyUsed: 'primary',
      },
      webhookEventId: 'wh-3a',
      nativeSmsEnabled: true,
    });

    expect(firstResult.status).toBe(200);
    expect(firstResult.kind).toBe('stop_applied');
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);

    // Simulate the contact already being 'stopped' in the DB by the second
    // call — the onConflictDoUpdate CASE WHEN branch is what keeps this a
    // no-op at the SQL layer; here we assert the handler drives the exact
    // same upsert/cascade shape again on retry (never throws, never skips
    // the cascade update believing it already ran).
    const secondMessage = makeMessage('STOP', { messageId: 'evt-b' });
    const secondResult = await handleVerifiedInbound({
      verified: {
        message: secondMessage,
        rawBody: 'From=%2B15551234567&Body=STOP',
        providerEventId: 'evt-b',
        keyUsed: 'primary',
      },
      webhookEventId: 'wh-3b',
      nativeSmsEnabled: true,
    });

    expect(secondResult.status).toBe(200);
    expect(secondResult.kind).toBe('stop_applied');
    expect(mockDbTransaction).toHaveBeenCalledTimes(2);

    // Both calls issued the identical targeting: same phone/hash, same
    // 'stopped' status, same cascade WHERE — repeat delivery does not
    // escalate, branch differently, or corrupt state.
    expect(mockTxInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ phone: TEST_PHONE, smsStatus: 'stopped' })
    );
    expect(mockTxInsertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ phone: TEST_PHONE, smsStatus: 'stopped' })
    );
    expect(mockTxUpdateWhere).toHaveBeenNthCalledWith(
      1,
      and(
        eq(notificationSubscriptions.phone, TEST_PHONE),
        eq(notificationSubscriptions.channel, 'sms'),
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`
      )
    );
    expect(mockTxUpdateWhere).toHaveBeenNthCalledWith(
      2,
      and(
        eq(notificationSubscriptions.phone, TEST_PHONE),
        eq(notificationSubscriptions.channel, 'sms'),
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`
      )
    );
  });

  it('skips the mutation (and never throws) when the From phone cannot be normalized', async () => {
    const message = makeMessage('STOP', { fromPhone: 'not-a-phone' });

    const result = await handleVerifiedInbound({
      verified: {
        message,
        rawBody: 'From=not-a-phone&Body=STOP',
        providerEventId: 'evt-badphone',
        keyUsed: 'primary',
      },
      webhookEventId: 'wh-5',
      nativeSmsEnabled: true,
    });

    // handleStopCommand guards suppressPhoneForStop behind `if (phoneNorm)`;
    // an unidentifiable sender still gets a clean 200 (no retry storm) but
    // no reply and no attempted write — asserting the guard actually
    // short-circuits the transaction, not just that the status is 200.
    expect(result).toEqual({
      status: 200,
      kind: 'stop_applied',
      outboundReply: undefined,
    });
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });
});

describe('handleVerifiedInbound — non-STOP commands never write an opt-out', () => {
  it('HELP replies with help text and does not touch notification_contacts or notification_subscriptions', async () => {
    const message = makeMessage('HELP');

    const result = await handleVerifiedInbound({
      verified: {
        message,
        rawBody: 'From=%2B15551234567&Body=HELP',
        providerEventId: 'evt-help-1',
        keyUsed: 'primary',
      },
      webhookEventId: 'wh-4',
      nativeSmsEnabled: true,
    });

    expect(result).toEqual({
      status: 200,
      kind: 'help_replied',
      outboundReply: { to: TEST_PHONE, body: HELP_REPLY_TEXT },
    });

    // The decisive negative assertion: no transaction, no insert, no update.
    // If HELP were ever mis-routed into the STOP handler (or vice versa),
    // this would catch it.
    expect(mockDbTransaction).not.toHaveBeenCalled();
    expect(mockTxInsert).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});
