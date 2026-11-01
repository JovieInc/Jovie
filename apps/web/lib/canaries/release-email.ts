/** JOV-9779 release-email canary. Fail closed without both synthetic ids. */
import { z } from 'zod';
import { parseSyntheticPrincipalEmail } from '@/lib/synthetic/principals';
import {
  isInternalOrTestAccountEmail,
  normalizeEmail,
} from '@/lib/utils/email';
export const RELEASE_EMAIL_CANARY_NAME = 'release-email' as const;
export const RELEASE_EMAIL_CANARY_ACTOR_ID = 'release' as const;
export const RELEASE_EMAIL_CANARY_SUBSCRIBER_RUN_TAG = 'email' as const;
export const RELEASE_EMAIL_CANARY_ARTIST_RUN_TAG = 'artist' as const;
export const RELEASE_EMAIL_CANARY_REDIS_KEY = 'canary:release-email:latest';
export const RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY =
  'canary:release-email:pending';
export const RELEASE_EMAIL_CANARY_DELIVERY_SLA_MS = 30 * 60_000;
export const RELEASE_EMAIL_CANARY_METADATA_KEY = 'releaseEmailCanaryRunId';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export interface ReleaseEmailCanaryScope {
  readonly creatorProfileId: string;
  readonly recipientEmail: string;
}
function isCanaryPrincipal(email: string, runTag: string): boolean {
  const parsed = parseSyntheticPrincipalEmail(email);
  return (
    parsed?.actorId === RELEASE_EMAIL_CANARY_ACTOR_ID &&
    parsed.runTag === runTag &&
    isInternalOrTestAccountEmail(email)
  );
}
export function isReleaseEmailCanarySubscriberEmail(
  email: string | null | undefined
): boolean {
  return (
    !!email && isCanaryPrincipal(email, RELEASE_EMAIL_CANARY_SUBSCRIBER_RUN_TAG)
  );
}
export function isReleaseEmailCanaryArtistEmail(
  email: string | null | undefined
): boolean {
  return (
    !!email && isCanaryPrincipal(email, RELEASE_EMAIL_CANARY_ARTIST_RUN_TAG)
  );
}
export function readReleaseEmailCanaryScope(
  env: Readonly<{
    RELEASE_EMAIL_CANARY_PROFILE_ID?: string | undefined;
    RELEASE_EMAIL_CANARY_INBOX?: string | undefined;
  }>
): ReleaseEmailCanaryScope | null {
  const creatorProfileId = env.RELEASE_EMAIL_CANARY_PROFILE_ID?.trim();
  const inbox = env.RELEASE_EMAIL_CANARY_INBOX?.trim();
  if (!creatorProfileId || !inbox) return null;
  if (!UUID_PATTERN.test(creatorProfileId)) return null;
  if (!isReleaseEmailCanarySubscriberEmail(inbox)) return null;
  return {
    creatorProfileId: creatorProfileId.toLowerCase(),
    recipientEmail: normalizeEmail(inbox),
  };
}
export function isReleaseEmailCanaryRecipient(
  scope: ReleaseEmailCanaryScope | null,
  target: Readonly<{
    creatorProfileId: string;
    channel: string | null | undefined;
    email: string | null | undefined;
  }>
): boolean {
  if (!scope || target.channel !== 'email' || !target.email) return false;
  return (
    target.creatorProfileId.toLowerCase() === scope.creatorProfileId &&
    normalizeEmail(target.email) === scope.recipientEmail &&
    isReleaseEmailCanarySubscriberEmail(target.email)
  );
}
export function buildReleaseEmailCanaryRunId(now: Date): string {
  return `rel-${now
    .toISOString()
    .replaceAll(/[^0-9]/g, '')
    .slice(0, 14)}`;
}
export function buildReleaseEmailCanaryReleaseTitle(runId: string): string {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Release-email canary run id "${runId}" is malformed`);
  }
  return `Release canary ${runId}`;
}
export const releaseEmailCanaryPendingRunSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().regex(RUN_ID_PATTERN),
  releaseId: z.string().uuid(),
  releaseTitle: z.string().min(1),
  releaseCreatedAt: z.string().datetime(),
  smartLinkUrl: z.string().url(),
  deployedSha: z.string().nullable(),
});
export type ReleaseEmailCanaryPendingRun = z.infer<
  typeof releaseEmailCanaryPendingRunSchema
>;
export const RELEASE_EMAIL_CANARY_FAILURE_REASONS = [
  'not_configured',
  'canary_profile_invalid',
  'no_pending_run',
  'not_scheduled',
  'not_sent',
  'no_provider_message_id',
  'inbox_unavailable',
  'not_delivered',
  'duplicate_delivery',
  'content_mismatch',
  'sla_exceeded',
] as const;
export type ReleaseEmailCanaryFailureReason =
  (typeof RELEASE_EMAIL_CANARY_FAILURE_REASONS)[number];
const isoOrNull = z.string().datetime().nullable();
const msOrNull = z.number().int().nonnegative().nullable();
export const releaseEmailCanaryReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  canary: z.literal(RELEASE_EMAIL_CANARY_NAME),
  runAt: z.string().datetime(),
  status: z.enum(['passed', 'failed']),
  failureReason: z.enum(RELEASE_EMAIL_CANARY_FAILURE_REASONS).nullable(),
  deployedSha: z.string().nullable(),
  evaluatedRunId: z.string().nullable(),
  releaseId: z.string().nullable(),
  notificationId: z.string().nullable(),
  providerMessageId: z.string().nullable(),
  releaseCreatedAt: isoOrNull,
  scheduledAt: isoOrNull,
  sentAt: isoOrNull,
  inboxReceivedAt: isoOrNull,
  latenciesMs: z.object({
    schedule: msOrNull,
    send: msOrNull,
    delivered: msOrNull,
    total: msOrNull,
  }),
  nextRunId: z.string().nullable(),
});
export type ReleaseEmailCanaryReceipt = z.infer<
  typeof releaseEmailCanaryReceiptSchema
>;
export interface ReleaseEmailCanaryObservation {
  readonly runAt: Date;
  readonly deployedSha: string | null;
  readonly pending: ReleaseEmailCanaryPendingRun | null;
  readonly notification: {
    readonly id: string;
    readonly status: string;
    readonly createdAt: Date;
    readonly sentAt: Date | null;
  } | null;
  readonly providerMessageId: string | null;
  readonly inboxMessages: ReadonlyArray<{
    readonly receivedAt: Date;
    readonly subject: string | null;
    readonly bodyHtml: string | null;
  }> | null;
  readonly nextRunId: string | null;
}
function diffMs(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, to.getTime() - from.getTime());
}
const EMPTY_RECEIPT = {
  schemaVersion: 1 as const,
  canary: RELEASE_EMAIL_CANARY_NAME,
  status: 'failed' as const,
  failureReason: null,
  deployedSha: null,
  evaluatedRunId: null,
  releaseId: null,
  notificationId: null,
  providerMessageId: null,
  releaseCreatedAt: null,
  scheduledAt: null,
  sentAt: null,
  inboxReceivedAt: null,
  latenciesMs: { schedule: null, send: null, delivered: null, total: null },
  nextRunId: null,
};
function finishReceipt(
  fields: Partial<ReleaseEmailCanaryReceipt> &
    Pick<ReleaseEmailCanaryReceipt, 'runAt'>
): ReleaseEmailCanaryReceipt {
  return releaseEmailCanaryReceiptSchema.parse({ ...EMPTY_RECEIPT, ...fields });
}
export function evaluateReleaseEmailCanary(
  observation: ReleaseEmailCanaryObservation
): ReleaseEmailCanaryReceipt {
  const { pending, notification } = observation;
  const releaseCreatedAt = pending ? new Date(pending.releaseCreatedAt) : null;
  const scheduledAt = notification?.createdAt ?? null;
  const sentAt = notification?.sentAt ?? null;
  const matching =
    pending && observation.inboxMessages
      ? observation.inboxMessages.filter(message =>
          (message.subject ?? '').includes(pending.releaseTitle)
        )
      : [];
  const delivered = matching.length === 1 ? matching[0] : null;
  const inboxReceivedAt = delivered?.receivedAt ?? null;
  let failureReason: ReleaseEmailCanaryFailureReason | null = null;
  if (!pending) failureReason = 'no_pending_run';
  else if (!notification) failureReason = 'not_scheduled';
  else if (notification.status !== 'sent' || !sentAt)
    failureReason = 'not_sent';
  else if (!observation.providerMessageId)
    failureReason = 'no_provider_message_id';
  else if (observation.inboxMessages === null)
    failureReason = 'inbox_unavailable';
  else if (matching.length === 0) failureReason = 'not_delivered';
  else if (matching.length > 1) failureReason = 'duplicate_delivery';
  else if (
    !delivered?.bodyHtml?.includes(pending.smartLinkUrl) ||
    !/unsubscribe/i.test(delivered.bodyHtml)
  )
    failureReason = 'content_mismatch';
  else if (
    (diffMs(releaseCreatedAt, inboxReceivedAt) ?? Infinity) >
    RELEASE_EMAIL_CANARY_DELIVERY_SLA_MS
  )
    failureReason = 'sla_exceeded';
  return finishReceipt({
    runAt: observation.runAt.toISOString(),
    status: failureReason ? 'failed' : 'passed',
    failureReason,
    deployedSha: observation.deployedSha,
    evaluatedRunId: pending?.runId ?? null,
    releaseId: pending?.releaseId ?? null,
    notificationId: notification?.id ?? null,
    providerMessageId: observation.providerMessageId,
    releaseCreatedAt: releaseCreatedAt?.toISOString() ?? null,
    scheduledAt: scheduledAt?.toISOString() ?? null,
    sentAt: sentAt?.toISOString() ?? null,
    inboxReceivedAt: inboxReceivedAt?.toISOString() ?? null,
    latenciesMs: {
      schedule: diffMs(releaseCreatedAt, scheduledAt),
      send: diffMs(scheduledAt, sentAt),
      delivered: diffMs(sentAt, inboxReceivedAt),
      total: diffMs(releaseCreatedAt, inboxReceivedAt),
    },
    nextRunId: observation.nextRunId,
  });
}
export function buildReleaseEmailCanaryRefusal(
  runAt: Date,
  deployedSha: string | null,
  failureReason: 'not_configured' | 'canary_profile_invalid'
): ReleaseEmailCanaryReceipt {
  return finishReceipt({
    runAt: runAt.toISOString(),
    status: 'failed',
    failureReason,
    deployedSha,
  });
}
