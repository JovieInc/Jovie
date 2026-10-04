import 'server-only';

import {
  getCanonicalPublicProfileClickObservation,
  getCanonicalPublicProfileViewObservation,
} from '@/lib/db/queries/analytics';
import { captureError } from '@/lib/error-tracking';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import type {
  CapabilityCertification,
  CapabilityEvidenceRecord,
  CapabilityObservation,
  CapabilityRollout,
} from './capability-evidence-model';
import { loadFeatureRegistryMarkdown } from './feature-registry-source';
import { buildFeatureReviewItems } from './founder-review-registry';

export {
  CAPABILITY_EVIDENCE_STAGES,
  CAPABILITY_STAGE_LABEL,
  type CapabilityCertification,
  type CapabilityDeployment,
  type CapabilityEvidenceRecord,
  type CapabilityEvidenceStage,
  type CapabilityObservation,
  type CapabilityRollout,
  deriveCapabilityStage,
} from './capability-evidence-model';

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

const CUSTOMER_POPULATION =
  'public claimed profiles owned by non-internal accounts (JOV-7362 exclusions)';

async function observeProfileExposure(
  now: Date
): Promise<CapabilityObservation> {
  const population = `${CUSTOMER_POPULATION}; bot-filtered upstream at write time`;
  try {
    const row = await getCanonicalPublicProfileViewObservation({
      windowDays: EVIDENCE_WINDOW_DAYS,
    });
    if (!row) return unmeasured(population);
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
    const row = await getCanonicalPublicProfileClickObservation({
      windowDays: EVIDENCE_WINDOW_DAYS,
    });
    if (!row) return unmeasured(population);
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
