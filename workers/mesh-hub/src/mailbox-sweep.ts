/**
 * Alarm-sweep helpers for one mailbox: automated-notice TTL, the stale-mail
 * alarm, and the coalesced dead-letter summary.
 */
import {
  type Delivered,
  type EnqueueResult,
  type Envelope,
  LIMITS,
  sha256Hex,
} from './core.ts';
import type { Env } from './env.ts';
import { dlqFallbackFull } from './envelope-policy.ts';
import type { MailboxConfig } from './mailbox.ts';
import type { MailboxStore } from './mailbox-store.ts';

/** AUTO_NOTICE_TTL_MS override, clamped to [1 minute, 7 days]. */
export function noticeTtlMs(rawValue: string | undefined): number {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw) || raw <= 0) return LIMITS.autoNoticeTtlMs;
  return Math.min(Math.max(raw, 60_000), 7 * 86_400_000);
}

/**
 * Mail received but not handled within MAIL_STALE_MS (default 10 min) alarms once per
 * oldest message through the registry (-> Summer + ALERT_KINDS), whatever the cause:
 * dead reader, executor failure, or no reader at all.
 */
export async function alarmStaleMail(
  env: Env,
  store: MailboxStore,
  config: MailboxConfig | null,
  now: number
): Promise<void> {
  const oldest = store.oldestUnackedMessage();
  if (!config || !oldest) return;
  const staleMs = Math.max(60_000, Number(env.MAIL_STALE_MS ?? 600_000));
  const age = now - oldest.acceptedAt;
  if (age < staleMs || store.getMeta('staleAlarmedFor') === oldest.id) return;
  store.setMeta('staleAlarmedFor', oldest.id);
  const registry = env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
  await registry.recordEvent('mail.stale', config.kind, {
    id: oldest.id,
    from: oldest.from,
    ageMin: Math.round(age / 60_000),
    unhandled: store.unackedCount(),
  });
}

/**
 * Dead-letter bookkeeping: the registry event fires now; the fallback wrapper
 * is no longer sent per dead message — flushDlq coalesces it per window.
 */
export async function notifyDeadLetter(
  env: Env,
  store: MailboxStore,
  config: MailboxConfig,
  dead: Delivered,
  now: number
): Promise<void> {
  const fallback =
    config.fallback && config.fallback !== config.kind ? config.fallback : null;
  const registry = env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
  await registry.recordEvent('message.dead', config.kind, {
    id: dead.id,
    from: dead.from,
    fallback,
  });
  if (!fallback) return;
  store.recordDlqDead(
    config.kind,
    fallback,
    dead.seq,
    now,
    LIMITS.dlqCoalesceMs
  );
}

/**
 * Coalesced DLQ: at most one summary wrapper per (mailbox, fallback) per
 * LIMITS.dlqCoalesceMs, carrying a count plus first/last seq instead of one
 * wrapper per dead message. A fallback that is itself full (or at
 * LIMITS.dlqFullFraction of cap) gets no wrapper at all — just a registry
 * event. Automated notices are never accumulated here (see sweepDead).
 */
export async function flushDlqSummary(
  env: Env,
  store: MailboxStore,
  config: MailboxConfig,
  now: number
): Promise<void> {
  const fallback =
    config.fallback && config.fallback !== config.kind ? config.fallback : null;
  if (!fallback) return;
  const summary = store.pendingDlqSummary(
    config.kind,
    fallback,
    now,
    LIMITS.dlqCoalesceMs
  );
  if (!summary) return;
  const registry = env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
  const stub = env.MAILBOX.get(env.MAILBOX.idFromName(fallback));
  let fallbackUnacked: number | null = null;
  try {
    fallbackUnacked = await stub.unacked();
  } catch {
    fallbackUnacked = null; // unknown fullness: try the enqueue and let 507 decide
  }
  const suppress = async (why: string) => {
    await registry.recordEvent('dlq.suppressed', config.kind, {
      fallback,
      fallbackUnacked: fallbackUnacked ?? -1,
      count: summary.count,
      firstSeq: summary.firstSeq,
      lastSeq: summary.lastSeq,
      why,
    });
    store.clearDlqSummary(config.kind, fallback);
  };
  if (dlqFallbackFull(fallbackUnacked)) {
    await suppress('fallback_full');
    return;
  }
  const body = JSON.stringify({
    schema: 'jovie.mesh-undeliverable/v1',
    summary: true,
    originalTo: config.kind,
    count: summary.count,
    firstSeq: summary.firstSeq,
    lastSeq: summary.lastSeq,
    windowStart: new Date(summary.windowStart).toISOString(),
    note: `Summary of ${summary.count} unhandled message(s) in ${config.kind}'s mailbox between seq ${summary.firstSeq} and ${summary.lastSeq}. The originals stay queued for ${config.kind}; reply on the mesh to take any of them over.`,
  });
  const wrapper: Envelope = {
    id: `mesh-hub:dlq-sum:${config.kind}:${summary.windowStart}`,
    from: 'mesh-hub',
    to: fallback,
    correlationId: `dlq-sum:${config.kind}:${summary.windowStart}`,
    sha256: await sha256Hex(body),
    body,
    refs: [],
    inReplyTo: null,
    sentAt: null,
    acceptedAt: Date.now(),
    kind: 'undeliverable',
  };
  let result: EnqueueResult;
  try {
    result = await stub.enqueue(wrapper);
  } catch {
    // Transport error: keep the summary; the next sweep retries it.
    return;
  }
  if (result.ok || result.status === 409) {
    store.clearDlqSummary(config.kind, fallback);
    return;
  }
  if (result.status === 507) {
    await suppress('fallback_full');
    return;
  }
  throw new Error(`dead-letter summary enqueue failed: ${result.code}`);
}
