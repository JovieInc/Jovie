import {
  and,
  sql as drizzleSql,
  inArray,
  isNotNull,
  isNull,
  lt,
} from 'drizzle-orm';
import type { TransactionType } from '@/lib/db/client/types';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';
import { users } from '@/lib/db/schema/auth';
import { baUsers } from '@/lib/db/schema/better-auth';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { iosPushDevices } from '@/lib/db/schema/ios-push-devices';
import { preSaveTokens } from '@/lib/db/schema/pre-save';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { emailSuppressions } from '@/lib/db/schema/suppression';
import {
  FOUNDER_REVIEW_SOURCE,
  FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
} from '@/lib/founder-review/contract';
import {
  DOGFOOD_ACCOUNT_EMAIL_TAG,
  FOUNDER_EMAIL_DOMAIN,
  FOUNDER_EMAIL_LOCAL_PART,
} from '@/lib/utils/email';
import {
  EPHEMERAL_DOGFOOD_MAX_AGE_DAYS,
  isExpiredEphemeralDogfoodAccount,
} from './dogfood-account';

/**
 * Removes ephemeral founder dogfood accounts (`+dogfood-tmp-<id>`) older than
 * EPHEMERAL_DOGFOOD_MAX_AGE_DAYS, the same way `/api/account/delete` erases an
 * account: the app user is fenced (PII nulled, deleted_at set, banned) and its
 * profiles, pre-save tokens, push devices, feedback, suppressions it created
 * and agent drafts are deleted; the Better Auth identity is deleted too, which
 * cascades its sessions and linked accounts.
 *
 * Closed by default. A row is touched only when ALL hold, re-checked in the
 * write itself: internal-marked (`account_class` set), not already deleted,
 * created before the cutoff, email on the exact tmp dogfood pattern (SQL
 * prefilter, then the JS classifier). Accounts with a Stripe subscription or
 * founder-review uploads (blob storage) are skipped and reported, never
 * touched. Long-lived `+dogfood` / `+dogfood-<name>` accounts never match.
 * Dry run unless `apply: true`.
 */

export interface DogfoodTmpCleanupDb {
  /** Runs inside one system-actor (forced-RLS aware) transaction. */
  atomic<T>(fn: (tx: TransactionType) => Promise<T>): Promise<T>;
}

export interface DogfoodTmpCleanupReport {
  readonly mode: 'dry-run' | 'apply';
  readonly cutoff: string;
  readonly candidates: number;
  readonly matched: number;
  readonly skippedNotEphemeral: number;
  readonly skippedBilling: number;
  readonly skippedUploads: number;
  readonly removed: number;
  /** Redacted: the tmp id only, never the base local part or domain. */
  readonly sample: readonly string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TMP_PREFIX = `${FOUNDER_EMAIL_LOCAL_PART}+${DOGFOOD_ACCOUNT_EMAIL_TAG}-tmp-`;
// No `_` or `%` in the fixed parts, so LIKE treats them literally.
const TMP_EMAIL_LIKE = `${TMP_PREFIX}%@${FOUNDER_EMAIL_DOMAIN}`;

function tmpId(email: string): string {
  return email.slice(TMP_PREFIX.length, email.lastIndexOf('@'));
}

export async function runDogfoodTmpCleanup(
  db: DogfoodTmpCleanupDb,
  options: {
    apply: boolean;
    now?: Date;
    sampleSize?: number;
    /** Runs after commit with the removed profiles' handles (cache busting). */
    afterRemoval?: (handles: readonly string[]) => Promise<void>;
  }
): Promise<DogfoodTmpCleanupReport> {
  const now = options.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - EPHEMERAL_DOGFOOD_MAX_AGE_DAYS * DAY_MS
  );
  const guard = and(
    isNotNull(users.accountClass),
    isNull(users.deletedAt),
    lt(users.createdAt, cutoff),
    drizzleSql`lower(${users.email}) like ${TMP_EMAIL_LIKE}`
  );

  const handles: string[] = [];
  const report = await db.atomic(async tx => {
    handles.length = 0;
    const rows = await tx
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        betterAuthUserId: users.betterAuthUserId,
        subscriptionId: users.stripeSubscriptionId,
      })
      .from(users)
      .where(guard);

    // A separate builder query, not a correlated `sql` subquery: Drizzle
    // drops table qualifiers inside `sql` fields of a single-table select, so
    // `users.id` there resolved to `feedback_items.id` and nothing was skipped.
    const uploaders =
      rows.length === 0
        ? []
        : await tx
            .selectDistinct({ userId: feedbackItems.userId })
            .from(feedbackItems)
            .where(
              and(
                inArray(
                  feedbackItems.userId,
                  rows.map(row => row.id)
                ),
                inArray(feedbackItems.source, [
                  FOUNDER_REVIEW_SOURCE,
                  FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
                ])
              )
            );
    const withUploads = new Set(uploaders.map(row => row.userId));

    let skippedNotEphemeral = 0;
    let skippedBilling = 0;
    let skippedUploads = 0;
    const matched: (typeof rows)[number][] = [];
    for (const row of rows) {
      const email = row.email?.trim().toLowerCase() ?? '';
      if (
        !isExpiredEphemeralDogfoodAccount(
          { email, createdAt: row.createdAt },
          now
        )
      ) {
        skippedNotEphemeral++;
      } else if (row.subscriptionId) {
        skippedBilling++;
      } else if (withUploads.has(row.id)) {
        skippedUploads++;
      } else {
        matched.push({ ...row, email });
      }
    }

    let removed = 0;
    if (options.apply && matched.length > 0) {
      const ids = matched.map(row => row.id);
      // Agent drafts hold no user id; read them before the profiles go.
      const drafts = await tx
        .select({
          draftId: drizzleSql<
            string | null
          >`${creatorProfiles.settings}->'agentAcquisition'->>'draft_id'`,
        })
        .from(creatorProfiles)
        .where(inArray(creatorProfiles.userId, ids));

      // The fence re-asserts every guard, so a row that changed since the
      // read is left alone.
      const fenced = await tx
        .update(users)
        .set({
          name: null,
          email: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          waitlistEntryId: null,
          deletedAt: now,
          userStatus: 'banned',
          updatedAt: now,
        })
        .where(
          and(inArray(users.id, ids), isNull(users.stripeSubscriptionId), guard)
        )
        .returning({ id: users.id, betterAuthUserId: users.betterAuthUserId });
      const fencedIds = fenced.map(row => row.id);
      removed = fencedIds.length;

      if (fencedIds.length > 0) {
        const draftIds = drafts.flatMap(row =>
          row.draftId ? [row.draftId] : []
        );
        if (draftIds.length > 0) {
          await tx
            .delete(agentVisibilityDrafts)
            .where(inArray(agentVisibilityDrafts.id, draftIds));
        }
        const profiles = await tx
          .delete(creatorProfiles)
          .where(inArray(creatorProfiles.userId, fencedIds))
          .returning({ handle: creatorProfiles.usernameNormalized });
        handles.push(...profiles.map(profile => profile.handle));
        await tx
          .delete(preSaveTokens)
          .where(inArray(preSaveTokens.userId, fencedIds));
        await tx
          .delete(iosPushDevices)
          .where(inArray(iosPushDevices.userId, fencedIds));
        await tx
          .delete(feedbackItems)
          .where(inArray(feedbackItems.userId, fencedIds));
        await tx
          .delete(emailSuppressions)
          .where(inArray(emailSuppressions.createdBy, fencedIds));
        const baIds = fenced.flatMap(row =>
          row.betterAuthUserId ? [row.betterAuthUserId] : []
        );
        if (baIds.length > 0) {
          await tx.delete(baUsers).where(inArray(baUsers.id, baIds));
        }
      }
    }

    return {
      mode: options.apply ? 'apply' : 'dry-run',
      cutoff: cutoff.toISOString(),
      candidates: rows.length,
      matched: matched.length,
      skippedNotEphemeral,
      skippedBilling,
      skippedUploads,
      removed,
      sample: matched
        .slice(0, options.sampleSize ?? 10)
        .map(row => `tmp-${tmpId(row.email ?? '')}`),
    } satisfies DogfoodTmpCleanupReport;
  });
  if (handles.length > 0) await options.afterRemoval?.(handles);
  return report;
}
