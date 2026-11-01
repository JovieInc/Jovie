import 'server-only';
import { and, desc, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { BASE_URL } from '@/constants/domains';
import {
  buildReleaseEmailCanaryRefusal,
  buildReleaseEmailCanaryReleaseTitle,
  buildReleaseEmailCanaryRunId,
  evaluateReleaseEmailCanary,
  isReleaseEmailCanaryArtistEmail,
  RELEASE_EMAIL_CANARY_METADATA_KEY,
  RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY,
  RELEASE_EMAIL_CANARY_REDIS_KEY,
  type ReleaseEmailCanaryPendingRun,
  type ReleaseEmailCanaryReceipt,
  type ReleaseEmailCanaryScope,
  readReleaseEmailCanaryScope,
  releaseEmailCanaryPendingRunSchema,
  releaseEmailCanaryReceiptSchema,
} from '@/lib/canaries/release-email';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { inboundEmails } from '@/lib/db/schema/inbox';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { notificationDeliveryLog } from '@/lib/db/schema/suppression';
import { upsertProviderLink, upsertRelease } from '@/lib/discography/queries';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

const RECEIPT_TTL_SECONDS = 26 * 60 * 60;
function deployedSha(): string | null {
  return env.VERCEL_GIT_COMMIT_SHA ?? null;
}
async function readPendingRun(): Promise<ReleaseEmailCanaryPendingRun | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<unknown>(RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY);
  const parsed = releaseEmailCanaryPendingRunSchema.safeParse(
    typeof raw === 'string' ? JSON.parse(raw) : raw
  );
  return parsed.success ? parsed.data : null;
}
async function verifyCanaryProfile(
  scope: ReleaseEmailCanaryScope
): Promise<{ username: string } | null> {
  const [row] = await db
    .select({
      username: creatorProfiles.usernameNormalized,
      isClaimed: creatorProfiles.isClaimed,
      ownerEmail: users.email,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, scope.creatorProfileId))
    .limit(1);
  if (
    !row?.username ||
    row.isClaimed !== true ||
    !isReleaseEmailCanaryArtistEmail(row.ownerEmail)
  ) {
    return null;
  }
  return { username: row.username };
}
async function observePendingRun(
  scope: ReleaseEmailCanaryScope,
  pending: ReleaseEmailCanaryPendingRun
) {
  const [notification] = await db
    .select({
      id: fanReleaseNotifications.id,
      status: fanReleaseNotifications.status,
      createdAt: fanReleaseNotifications.createdAt,
      sentAt: fanReleaseNotifications.sentAt,
    })
    .from(fanReleaseNotifications)
    .where(
      and(
        eq(fanReleaseNotifications.releaseId, pending.releaseId),
        eq(fanReleaseNotifications.creatorProfileId, scope.creatorProfileId)
      )
    )
    .orderBy(desc(fanReleaseNotifications.createdAt))
    .limit(1);
  let providerMessageId: string | null = null;
  if (notification) {
    const [delivery] = await db
      .select({ providerMessageId: notificationDeliveryLog.providerMessageId })
      .from(notificationDeliveryLog)
      .where(
        and(
          eq(notificationDeliveryLog.status, 'sent'),
          drizzleSql`${notificationDeliveryLog.metadata}->>'notificationId' = ${notification.id}`
        )
      )
      .limit(1);
    providerMessageId = delivery?.providerMessageId ?? null;
  }
  const inboxMessages = env.RESEND_INBOUND_WEBHOOK_SECRET
    ? (
        await db
          .select({
            receivedAt: inboundEmails.createdAt,
            subject: inboundEmails.subject,
            bodyHtml: inboundEmails.bodyHtml,
          })
          .from(inboundEmails)
          .where(
            and(
              eq(inboundEmails.creatorProfileId, scope.creatorProfileId),
              drizzleSql`lower(${inboundEmails.toEmail}) = ${scope.recipientEmail}`,
              gte(inboundEmails.createdAt, new Date(pending.releaseCreatedAt))
            )
          )
      ).map(row => ({ ...row }))
    : null;
  return {
    notification: notification ?? null,
    providerMessageId,
    inboxMessages,
  };
}
async function triggerCanaryRelease(
  scope: ReleaseEmailCanaryScope,
  username: string,
  now: Date
): Promise<ReleaseEmailCanaryPendingRun> {
  const runId = buildReleaseEmailCanaryRunId(now);
  const title = buildReleaseEmailCanaryReleaseTitle(runId);
  const release = await upsertRelease({
    creatorProfileId: scope.creatorProfileId,
    title,
    slug: runId,
    releaseType: 'single',
    releaseDate: now,
    totalTracks: 1,
    sourceType: 'ingested',
    metadata: { [RELEASE_EMAIL_CANARY_METADATA_KEY]: runId },
  });
  await upsertProviderLink({
    releaseId: release.id,
    providerId: 'spotify',
    url: `${BASE_URL}/${encodeURIComponent(username)}/${encodeURIComponent(runId)}`,
    sourceType: 'ingested',
    isPrimary: true,
    metadata: { [RELEASE_EMAIL_CANARY_METADATA_KEY]: runId },
  });
  return releaseEmailCanaryPendingRunSchema.parse({
    schemaVersion: 1,
    runId,
    releaseId: release.id,
    releaseTitle: title,
    releaseCreatedAt: (release.createdAt ?? now).toISOString(),
    smartLinkUrl: `${BASE_URL}/${encodeURIComponent(username)}/${encodeURIComponent(release.slug)}`,
    deployedSha: deployedSha(),
  });
}
async function persist(
  receipt: ReleaseEmailCanaryReceipt,
  nextPending: ReleaseEmailCanaryPendingRun | null
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn('[canary/release-email] Redis unavailable; receipt not stored');
    return;
  }
  await redis.set(RELEASE_EMAIL_CANARY_REDIS_KEY, JSON.stringify(receipt), {
    ex: RECEIPT_TTL_SECONDS,
  });
  if (nextPending) {
    await redis.set(
      RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY,
      JSON.stringify(nextPending),
      { ex: RECEIPT_TTL_SECONDS }
    );
  }
}
export async function runReleaseEmailCanary(
  now: Date = new Date()
): Promise<ReleaseEmailCanaryReceipt> {
  const scope = readReleaseEmailCanaryScope(env);
  if (!scope) {
    const receipt = buildReleaseEmailCanaryRefusal(
      now,
      deployedSha(),
      'not_configured'
    );
    await persist(receipt, null);
    return receipt;
  }
  const profile = await verifyCanaryProfile(scope);
  if (!profile) {
    const receipt = buildReleaseEmailCanaryRefusal(
      now,
      deployedSha(),
      'canary_profile_invalid'
    );
    await persist(receipt, null);
    await captureError(
      'Release-email canary profile is not the synthetic canary artist',
      new Error('canary_profile_invalid'),
      { route: 'canary/release-email' }
    );
    return receipt;
  }
  const pending = await readPendingRun();
  const observed = pending
    ? await observePendingRun(scope, pending)
    : { notification: null, providerMessageId: null, inboxMessages: null };
  const next = await triggerCanaryRelease(scope, profile.username, now);
  const receipt = evaluateReleaseEmailCanary({
    runAt: now,
    deployedSha: deployedSha(),
    pending,
    ...observed,
    nextRunId: next.runId,
  });
  await persist(receipt, next);
  if (
    receipt.status === 'failed' &&
    receipt.failureReason !== 'no_pending_run'
  ) {
    logger.warn('[canary/release-email] Canary failed', {
      failureReason: receipt.failureReason,
      evaluatedRunId: receipt.evaluatedRunId,
    });
  }
  return receipt;
}
export async function getReleaseEmailCanaryStatus(): Promise<ReleaseEmailCanaryReceipt | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<unknown>(RELEASE_EMAIL_CANARY_REDIS_KEY);
    if (!raw) return null;
    const parsed = releaseEmailCanaryReceiptSchema.safeParse(
      typeof raw === 'string' ? JSON.parse(raw) : raw
    );
    return parsed.success ? parsed.data : null;
  } catch (error) {
    logger.warn('[canary/release-email] Failed to read receipt', error);
    return null;
  }
}
