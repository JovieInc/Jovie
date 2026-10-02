import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { clickEvents, dailyProfileViews } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import { INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN } from '@/lib/utils/email';
import { loadFeatureRegistryMarkdown } from './feature-registry-source';
import { buildFeatureReviewItems } from './founder-review-registry';

/**
 * JOV-7485 — evidence matrix for one customer capability, joining the
 * canonical registry subject, its certification evidence revision, the exact
 * deployed build, effective rollout configuration, and observed exposure and
 * outcome. Unknown stays unknown; uninstrumented states are never guessed.
 */

export const EVIDENCE_WINDOW_DAYS = 7;

/**
 * An observation is fresher than this many days old counts as current for the
 * measured window; older means the pipeline is lagging, not that usage stopped.
 */
const OBSERVATION_STALE_AFTER_DAYS = 2;

export const CAPABILITY_EVIDENCE_STAGES = [
  'unknown',
  'failure',
  'merged-only',
  'deployed-only',
  'configured-unobserved',
  'stale-observation',
  'stale-client',
  'partial-rollout',
  'healthy',
] as const;

export type CapabilityEvidenceStage =
  (typeof CAPABILITY_EVIDENCE_STAGES)[number];

export const CAPABILITY_STAGE_LABEL: Record<CapabilityEvidenceStage, string> = {
  unknown: 'Unknown',
  failure: 'Observation failure',
  'merged-only': 'Merged only',
  'deployed-only': 'Deployed, unobserved',
  'configured-unobserved': 'Configured, unobserved',
  'stale-observation': 'Stale observation',
  'stale-client': 'Stale client',
  'partial-rollout': 'Partial rollout',
  healthy: 'Healthy',
};

export interface CapabilityObservation {
  /** Whether an authoritative source answered at all. */
  readonly measured: boolean;
  readonly count: number | null;
  /** ISO date of the newest observed event day, when the source reported one. */
  readonly latestAt: string | null;
  readonly stale: boolean;
  readonly windowDays: number;
  /** The population the count actually covers — never widened implicitly. */
  readonly population: string;
  readonly error: string | null;
}

export interface CapabilityCertification {
  readonly state: string;
  readonly readiness: string;
  readonly decisionEvidenceDigest: string;
  readonly sourcePath: string;
}

export interface CapabilityDeployment {
  readonly commitSha: string | null;
  readonly version: string | null;
  readonly environment: string | null;
  readonly deploymentId: string | null;
}

export interface CapabilityRollout {
  /** Raw flag/gate text from the canonical registry ('None' → ungated). */
  readonly gate: string | null;
  /** Configured rollout percent when the capability is gated; null = ungated. */
  readonly configuredPercent: number | null;
}

export interface CapabilityEvidenceRecord {
  /** Stable ID from docs/FEATURE_REGISTRY.md ("public-profile-pages"). */
  readonly capabilityId: string;
  /** Canonical subject ID inside the certification packet. */
  readonly subjectId: string;
  readonly title: string;
  readonly goldenPath: string;
  readonly certification: CapabilityCertification | null;
  readonly deployment: CapabilityDeployment;
  readonly rollout: CapabilityRollout;
  /** Installed/running client build — not instrumented, always null today. */
  readonly clientSha: string | null;
  readonly exposure: CapabilityObservation;
  readonly outcome: CapabilityObservation;
  readonly generatedAt: string;
}

function unmeasured(population: string, error?: string): CapabilityObservation {
  return {
    measured: false,
    count: null,
    latestAt: null,
    stale: false,
    windowDays: EVIDENCE_WINDOW_DAYS,
    population,
    error: error ?? null,
  };
}

function daysSince(isoDate: string, now: Date): number {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

function measured(
  count: number,
  latestAt: string | null,
  stale: boolean,
  population: string
): CapabilityObservation {
  return {
    measured: true,
    count,
    latestAt,
    stale,
    windowDays: EVIDENCE_WINDOW_DAYS,
    population,
    error: null,
  };
}

/**
 * Derives the evidenced lifecycle stage. Merged, certified, deployed, exposed
 * and observed are distinct states — a stage is only claimed when its own
 * evidence exists, and any read failure fails the whole record closed.
 */
export function deriveCapabilityStage(
  record: Pick<
    CapabilityEvidenceRecord,
    | 'certification'
    | 'deployment'
    | 'rollout'
    | 'clientSha'
    | 'exposure'
    | 'outcome'
  >
): CapabilityEvidenceStage {
  if (record.exposure.error || record.outcome.error) return 'failure';
  if (!record.certification) return 'unknown';
  if (!record.deployment.commitSha) return 'merged-only';
  if (
    record.clientSha &&
    record.deployment.commitSha &&
    record.clientSha !== record.deployment.commitSha
  ) {
    return 'stale-client';
  }
  if (!record.exposure.measured) {
    return record.rollout.configuredPercent !== null || record.rollout.gate
      ? 'configured-unobserved'
      : 'deployed-only';
  }
  if (record.exposure.stale) return 'stale-observation';
  if (
    record.rollout.configuredPercent !== null &&
    record.rollout.configuredPercent < 100
  ) {
    return 'partial-rollout';
  }
  return record.outcome.measured ? 'healthy' : 'configured-unobserved';
}

const CUSTOMER_POPULATION =
  'public claimed profiles owned by non-internal accounts (JOV-7362 exclusions)';

async function observeProfileExposure(
  now: Date
): Promise<CapabilityObservation> {
  const population = `${CUSTOMER_POPULATION}; bot-filtered upstream at write time`;
  try {
    if (
      !(await doesTableExist(TABLE_NAMES.creatorProfiles)) ||
      !(await doesTableExist(TABLE_NAMES.dailyProfileViews))
    ) {
      return unmeasured(population);
    }
    const [row] = await db
      .select({
        count: drizzleSql<number>`coalesce(sum(${dailyProfileViews.viewCount}), 0)::int`,
        latest: drizzleSql<string | null>`max(${dailyProfileViews.viewDate})`,
      })
      .from(dailyProfileViews)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, dailyProfileViews.creatorProfileId)
      )
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(
        and(
          drizzleSql`${dailyProfileViews.viewDate} >= (current_date - ${EVIDENCE_WINDOW_DAYS})::text::date`,
          eq(creatorProfiles.isPublic, true),
          eq(creatorProfiles.isClaimed, true),
          drizzleSql`(${users.email} is null or lower(${users.email}) !~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN})`
        )
      );
    const latest = row?.latest ?? null;
    const stale =
      latest === null || daysSince(latest, now) > OBSERVATION_STALE_AFTER_DAYS;
    return measured(Number(row?.count ?? 0), latest, stale, population);
  } catch (error) {
    captureError('capability evidence: profile exposure read failed', error);
    return unmeasured(
      population,
      error instanceof Error ? error.message : 'read failed'
    );
  }
}

async function observeLinkTapOutcome(): Promise<CapabilityObservation> {
  const population = `${CUSTOMER_POPULATION}; is_bot = false`;
  try {
    if (
      !(await doesTableExist(TABLE_NAMES.creatorProfiles)) ||
      !(await doesTableExist(TABLE_NAMES.clickEvents))
    ) {
      return unmeasured(population);
    }
    const [row] = await db
      .select({
        count: drizzleSql<number>`count(*)::int`,
        latest: drizzleSql<
          string | null
        >`max(${clickEvents.createdAt}::date)::text`,
      })
      .from(clickEvents)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, clickEvents.creatorProfileId)
      )
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(
        and(
          drizzleSql`${clickEvents.createdAt} >= now() - make_interval(days => ${EVIDENCE_WINDOW_DAYS})`,
          eq(clickEvents.isBot, false),
          eq(creatorProfiles.isPublic, true),
          eq(creatorProfiles.isClaimed, true),
          drizzleSql`(${users.email} is null or lower(${users.email}) !~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN})`
        )
      );
    const latest = row?.latest ?? null;
    const stale = latest === null;
    return measured(Number(row?.count ?? 0), latest, stale, population);
  } catch (error) {
    captureError('capability evidence: link tap outcome read failed', error);
    return unmeasured(
      population,
      error instanceof Error ? error.message : 'read failed'
    );
  }
}

function parseConfiguredPercent(gate: string | null): number | null {
  if (!gate) return null;
  const match = /(\d{1,3})\s*%/.exec(gate);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}

/**
 * Loads the evidence record for the first vertical slice: public profile
 * pages, whose reproducible golden path is "fan visits a public profile, then
 * taps a listen/social link". Client build distribution remains uninstrumented
 * and is reported as unknown rather than guessed.
 */
export async function loadCapabilityEvidence(
  now: Date = new Date()
): Promise<CapabilityEvidenceRecord> {
  const registryTitle = 'Public profile pages';
  const build = await getDeployedBuildInfo();

  let certification: CapabilityCertification | null = null;
  let gate: string | null = null;
  let subjectId = 'feature.profile.public-profile-pages';
  try {
    const items = buildFeatureReviewItems(await loadFeatureRegistryMarkdown());
    const item = items.find(entry => entry.title === registryTitle);
    if (item) {
      subjectId = item.id;
      gate = item.gate === 'None' ? null : item.gate;
      certification = {
        state: item.certificationState,
        readiness: item.readiness,
        decisionEvidenceDigest: item.decisionEvidenceDigest,
        sourcePath: item.source,
      };
    }
  } catch (error) {
    captureError(
      'capability evidence: registry certification read failed',
      error
    );
  }

  const [exposure, outcome] = await Promise.all([
    observeProfileExposure(now),
    observeLinkTapOutcome(),
  ]);

  const rollout: CapabilityRollout = {
    gate,
    configuredPercent: parseConfiguredPercent(gate),
  };

  return {
    capabilityId: 'public-profile-pages',
    subjectId,
    title: registryTitle,
    goldenPath:
      'Fan opens a public artist profile (/{username}) and taps a listen or social link.',
    certification,
    deployment: {
      commitSha: build.commitSha ?? null,
      version: build.version || null,
      environment: build.environment ?? null,
      deploymentId: build.deploymentId ?? null,
    },
    rollout,
    // Client-side build distribution is not instrumented (JOV-7485 scope
    // boundary): leave null so stale-client can never be faked.
    clientSha: null,
    exposure,
    outcome,
    generatedAt: now.toISOString(),
  };
}
