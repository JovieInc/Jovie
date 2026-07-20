import 'server-only';

import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  profileSearchProviderHealth,
  profileSearchQueries,
  profileSearchResults,
  profileSearchRuns,
} from '@/lib/db/schema/profile-search';
import { profileSurfaces } from '@/lib/db/schema/profile-surfaces';
import { getAppFlagValue } from '@/lib/flags/server';
import { reserveProfileSearchAttempt } from './budget';
import { GoogleSerpApiProvider } from './google-serpapi';
import {
  type ClaimedProfileSearchQuery,
  type ProfileSearchRunnerDependencies,
  runProfileSearchBatch,
} from './runner-core';

const PROVIDER_ID = 'google_serpapi';
const LEASE_SECONDS = 120;

async function isProviderHealthy() {
  try {
    const [health] = await db
      .select({ enabled: profileSearchProviderHealth.enabled })
      .from(profileSearchProviderHealth)
      .where(eq(profileSearchProviderHealth.provider, PROVIDER_ID))
      .limit(1);
    return health?.enabled === true;
  } catch {
    return false;
  }
}

async function claimDueQuery(): Promise<ClaimedProfileSearchQuery | null> {
  const result = await db.execute<{
    id: string;
    query_text: string;
    market: string;
    locale: 'en';
    device: 'desktop';
  }>(drizzleSql`
    WITH candidate AS (
      SELECT id
      FROM profile_search_queries
      WHERE enabled = true
        AND provider = ${PROVIDER_ID}
        AND next_run_at <= now()
        AND (lease_expires_at IS NULL OR lease_expires_at < now())
      ORDER BY next_run_at ASC, creator_profile_id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE profile_search_queries AS query
    SET lease_token = gen_random_uuid(),
        lease_expires_at = now() + (${LEASE_SECONDS} * interval '1 second'),
        updated_at = now()
    FROM candidate
    WHERE query.id = candidate.id
    RETURNING query.id, query.query_text, query.market, query.locale, query.device
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    request: {
      query: row.query_text,
      market: row.market,
      locale: row.locale,
      device: row.device,
      limit: 10,
    },
  };
}

async function createAttemptIntent(
  queryId: string,
  kind: 'scheduled' | 'retry'
) {
  const [run] = await db
    .insert(profileSearchRuns)
    .values({ queryId, provider: PROVIDER_ID, attemptKind: kind })
    .returning({ id: profileSearchRuns.id });
  if (!run) throw new Error('Failed to persist profile search attempt intent');
  return run.id;
}

async function loadSurfaces(queryId: string) {
  return db
    .select({
      id: profileSurfaces.id,
      kind: profileSurfaces.kind,
      normalizedUrl: profileSurfaces.normalizedUrl,
      qualificationStatus: profileSurfaces.qualificationStatus,
    })
    .from(profileSurfaces)
    .innerJoin(
      profileSearchQueries,
      eq(
        profileSearchQueries.creatorProfileId,
        profileSurfaces.creatorProfileId
      )
    )
    .where(
      and(
        eq(profileSearchQueries.id, queryId),
        eq(profileSurfaces.availability, 'eligible'),
        drizzleSql`${profileSurfaces.retiredAt} IS NULL`
      )
    );
}

const dependencies: ProfileSearchRunnerDependencies = {
  provider: new GoogleSerpApiProvider(),
  isRolloutEnabled: () => getAppFlagValue('PROFILE_SEARCH_MONITORING'),
  isProviderHealthy,
  claimDueQuery,
  createAttemptIntent,
  reserveAttemptBudget: reserveProfileSearchAttempt,
  async markAttemptIssued(attemptId) {
    await db
      .update(profileSearchRuns)
      .set({ state: 'issued', requestIssuedAt: new Date() })
      .where(eq(profileSearchRuns.id, attemptId));
  },
  loadSurfaces,
  async completeSuccess({ attemptId, queryId, response, results }) {
    await db.transaction(async tx => {
      if (results.length > 0) {
        await tx.insert(profileSearchResults).values(
          results.map(result => ({
            runId: attemptId,
            position: result.position,
            title: result.title,
            snippet: result.snippet,
            url: result.url,
            normalizedUrl: result.normalizedUrl,
            classification: result.classification,
            surfaceId: result.surfaceId,
          }))
        );
      }
      await tx
        .update(profileSearchRuns)
        .set({
          state: 'succeeded',
          fetchedAt: response.fetchedAt,
          completedAt: new Date(),
          comparable: true,
          usage: response.usage,
        })
        .where(eq(profileSearchRuns.id, attemptId));
      await tx
        .update(profileSearchQueries)
        .set({
          nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          leaseToken: null,
          leaseExpiresAt: null,
          lastSucceededAt: response.fetchedAt,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(profileSearchQueries.id, queryId));
      const observedSurfaceIds = results.flatMap(result =>
        result.surfaceId ? [result.surfaceId] : []
      );
      if (observedSurfaceIds.length > 0) {
        await tx
          .update(profileSurfaces)
          .set({ lastObservedAt: response.fetchedAt, updatedAt: new Date() })
          .where(inArray(profileSurfaces.id, observedSurfaceIds));
      }
    });
  },
  async completeFailure({ attemptId, queryId, code, message }) {
    const retryDelay =
      code === 'budget_exhausted' ? 15 * 60 * 1000 : 24 * 60 * 60 * 1000;
    await db.transaction(async tx => {
      await tx
        .update(profileSearchRuns)
        .set({
          state: code === 'timeout' ? 'timed_out' : 'failed',
          completedAt: new Date(),
          errorCode: code,
          errorMessage: message.slice(0, 1_000),
        })
        .where(eq(profileSearchRuns.id, attemptId));
      await tx
        .update(profileSearchQueries)
        .set({
          nextRunAt: new Date(Date.now() + retryDelay),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: message.slice(0, 1_000),
          updatedAt: new Date(),
        })
        .where(eq(profileSearchQueries.id, queryId));
    });
  },
  async markProviderSuccess() {
    await db
      .update(profileSearchProviderHealth)
      .set({
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
        disabledReason: null,
        updatedAt: new Date(),
      })
      .where(eq(profileSearchProviderHealth.provider, PROVIDER_ID));
  },
  async markProviderFailure(code) {
    await db.execute(drizzleSql`
      UPDATE profile_search_provider_health
      SET consecutive_failures = consecutive_failures + 1,
          last_failure_at = now(),
          enabled = CASE WHEN consecutive_failures + 1 >= 2 THEN false ELSE enabled END,
          disabled_reason = CASE
            WHEN consecutive_failures + 1 >= 2 THEN ${`two_consecutive_failures:${code}`}
            ELSE disabled_reason
          END,
          updated_at = now()
      WHERE provider = ${PROVIDER_ID}
    `);
  },
};

export function runProfileSearchMonitoring(deadlineAt: number) {
  return runProfileSearchBatch(dependencies, { deadlineAt });
}
