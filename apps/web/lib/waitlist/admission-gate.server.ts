import 'server-only';

import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import {
  PROD_GOLDEN_PATH_SURFACE_IDS,
  type ProdGoldenPathLedger,
  readProdGoldenPathLedger,
} from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { logger } from '@/lib/utils/logger';
import {
  type AdmissionDecision,
  DESIGN_JUDGE_LEDGER_KEY,
  type DesignJudgeLedger,
  decideAdmission,
  parseDesignJudgeLedger,
} from './admission-gate';
import type { ProfileCertLedger } from './profile-certification';
import { readProfileCertLedger } from './profile-certification.server';

/** Everything the gate reads once per request or drain. */
export interface AdmissionContext {
  readonly prodSha: string | null;
  readonly goldenPath: ProdGoldenPathLedger | null;
  readonly design: DesignJudgeLedger | null;
  readonly profiles: ProfileCertLedger | null;
}

const SHA_RE = /^[0-9a-f]{40}$/u;

async function safely<T>(label: string, read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    // An unreadable leg is an uncertified leg (fail closed).
    logger.warn(`[admission-gate] ${label} unreadable`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function readAdmissionContext(
  backend: CertificationRecordBackend = postgresRecordBackend()
): Promise<AdmissionContext> {
  const [build, goldenPath, designRaw, profiles] = await Promise.all([
    safely('build info', getDeployedBuildInfo),
    safely('golden-path ledger', () => readProdGoldenPathLedger(backend)),
    safely('design judge ledger', () => backend.get(DESIGN_JUDGE_LEDGER_KEY)),
    safely('profile ledger', () => readProfileCertLedger(backend)),
  ]);
  const sha = build?.commitSha ?? null;
  return {
    prodSha: sha && SHA_RE.test(sha) ? sha : null,
    goldenPath,
    design: parseDesignJudgeLedger(designRaw),
    profiles,
  };
}

export function decideForProfile(
  context: AdmissionContext,
  profileId: string | null
): AdmissionDecision {
  return decideAdmission({
    prodSha: context.prodSha,
    profileReceipt: profileId
      ? (context.profiles?.profiles[profileId]?.latest ?? null)
      : null,
    goldenPath: context.goldenPath,
    goldenPathSurfaces: PROD_GOLDEN_PATH_SURFACE_IDS,
    design: context.design,
  });
}

/** Entry id -> profile id (entries without a profile map to null). */
async function profilesForEntries(
  entryIds: readonly string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>(entryIds.map(id => [id, null]));
  if (entryIds.length === 0) return map;
  const rows = await db
    .select({
      id: creatorProfiles.id,
      entryId: creatorProfiles.waitlistEntryId,
    })
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.waitlistEntryId, [...entryIds]));
  for (const row of rows) if (row.entryId) map.set(row.entryId, row.id);
  return map;
}

/** Admission decision per waitlist entry, from one context read. */
export async function decideAdmissionForEntries(
  entryIds: readonly string[],
  context?: AdmissionContext
): Promise<{
  readonly context: AdmissionContext;
  readonly decisions: ReadonlyMap<
    string,
    AdmissionDecision & { readonly profileId: string | null }
  >;
}> {
  const resolved = context ?? (await readAdmissionContext());
  const profiles = await profilesForEntries(entryIds);
  const decisions = new Map<
    string,
    AdmissionDecision & { readonly profileId: string | null }
  >();
  for (const [entryId, profileId] of profiles) {
    decisions.set(entryId, {
      ...decideForProfile(resolved, profileId),
      profileId,
    });
  }
  return { context: resolved, decisions };
}

/** Admission decision for the account behind an email (paid admission). */
export async function decideAdmissionForEmail(
  email: string
): Promise<AdmissionDecision> {
  const [entry] = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(drizzleSql`lower(${waitlistEntries.email}) = lower(${email.trim()})`)
    .limit(1);
  const context = await readAdmissionContext();
  if (!entry) return decideForProfile(context, null);
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.waitlistEntryId, entry.id))
    .limit(1);
  return decideForProfile(context, profile?.id ?? null);
}

export interface WaitlistInviteGate {
  readonly profileId: string;
  /** All three admission legs are certified for the current production SHA. */
  readonly certified: boolean;
  /** Latest profile receipt time on this SHA; null means re-certify now. */
  readonly certifiedAt: string | null;
  readonly blocking: AdmissionDecision['blocking'];
}

/**
 * Auto-accept's view of the admission gate. Entries without a profile are
 * absent (nothing to certify; they confirm their artist in product first).
 */
export async function readWaitlistInviteGates(
  entryIds: readonly string[]
): Promise<ReadonlyMap<string, WaitlistInviteGate>> {
  const { context, decisions } = await decideAdmissionForEntries(entryIds);
  const gates = new Map<string, WaitlistInviteGate>();
  for (const [entryId, decision] of decisions) {
    if (!decision.profileId) continue;
    const latest = context.profiles?.profiles[decision.profileId]?.latest;
    gates.set(entryId, {
      profileId: decision.profileId,
      certified: decision.admit,
      certifiedAt:
        latest && latest.sha === context.prodSha ? latest.endedAt : null,
      blocking: decision.blocking,
    });
  }
  return gates;
}

/** Admission decision for an app user (paid admission path). */
export async function decideAdmissionForUser(
  appUserId: string
): Promise<AdmissionDecision> {
  const [user] = await db
    .select({ entryId: users.waitlistEntryId })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);
  const context = await readAdmissionContext();
  if (!user?.entryId) return decideForProfile(context, null);
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.waitlistEntryId, user.entryId))
    .limit(1);
  return decideForProfile(context, profile?.id ?? null);
}
