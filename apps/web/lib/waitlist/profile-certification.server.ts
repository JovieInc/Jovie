import 'server-only';

import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { BASE_URL } from '@/constants/domains';
import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases, smartLinkTargets } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureError } from '@/lib/error-tracking';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { logger } from '@/lib/utils/logger';
import {
  applyProfileCertReceipt,
  emptyProfileCertLedger,
  evaluateProfileCertification,
  isProfileCertifiedForInvite,
  PROFILE_CERT_LEDGER_KEY,
  PROFILE_CERT_RECEIPT_SCHEMA,
  type ProfileCertEvidence,
  type ProfileCertFacts,
  type ProfileCertLedger,
  ProfileCertPersistenceError,
  type ProfileCertReceipt,
  type ProfileCertRecord,
  type ProfileCertTrigger,
  parseProfileCertLedger,
} from './profile-certification';

/** Bound per certification: release rows read and public pages probed. */
const MAX_RELEASES_READ = 200;
const MAX_SMART_LINK_PROBES = 3;
const PROBE_TIMEOUT_MS = 8_000;
const PAGE_ERROR_MARKERS = [
  'Application error',
  'Something went wrong',
  '__next_error__',
  'This page could not be found',
] as const;

function readOnboardingSelection(settings: unknown): {
  id: string | null;
  name: string | null;
} {
  const onboarding =
    settings && typeof settings === 'object'
      ? (settings as { onboarding?: unknown }).onboarding
      : null;
  if (!onboarding || typeof onboarding !== 'object') {
    return { id: null, name: null };
  }
  const { selectedSpotifyArtistId, selectedSpotifyArtistName } =
    onboarding as Record<string, unknown>;
  return {
    id:
      typeof selectedSpotifyArtistId === 'string'
        ? selectedSpotifyArtistId
        : null,
    name:
      typeof selectedSpotifyArtistName === 'string'
        ? selectedSpotifyArtistName
        : null,
  };
}

async function probePage(url: string): Promise<{
  status: number;
  errorMarkers: string[];
}> {
  try {
    const response = await boundedFetch(url, {
      timeoutMs: PROBE_TIMEOUT_MS,
      context: 'profile-certification-probe',
      headers: { 'x-synthetic-monitoring': 'profile-certification' },
      redirect: 'follow',
    });
    const body = response.ok ? await response.text() : '';
    return {
      status: response.status,
      errorMarkers: PAGE_ERROR_MARKERS.filter(marker => body.includes(marker)),
    };
  } catch {
    return { status: 0, errorMarkers: ['unreachable'] };
  }
}

/** Reads one profile's certification facts from production. */
export async function readProfileCertFacts(
  profileId: string,
  options: { readonly probe?: boolean } = {}
): Promise<ProfileCertFacts | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      waitlistEntryId: creatorProfiles.waitlistEntryId,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyId: creatorProfiles.spotifyId,
      isPublic: creatorProfiles.isPublic,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  if (!profile) return null;

  const [owner] = profile.userId
    ? await db
        .select({
          name: users.name,
          plan: users.plan,
          isPro: users.isPro,
          stripeSubscriptionId: users.stripeSubscriptionId,
          trialEndsAt: users.trialEndsAt,
        })
        .from(users)
        .where(eq(users.id, profile.userId))
        .limit(1)
    : [];
  const [entry] = profile.waitlistEntryId
    ? await db
        .select({ fullName: waitlistEntries.fullName })
        .from(waitlistEntries)
        .where(eq(waitlistEntries.id, profile.waitlistEntryId))
        .limit(1)
    : [];

  const releaseRows = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, profileId),
        isNull(discogReleases.deletedAt)
      )
    )
    .limit(MAX_RELEASES_READ);

  const targetCounts =
    releaseRows.length === 0
      ? []
      : await db
          .select({ releaseId: smartLinkTargets.releaseId, n: count() })
          .from(smartLinkTargets)
          .where(
            and(
              eq(smartLinkTargets.creatorProfileId, profileId),
              inArray(
                smartLinkTargets.releaseId,
                releaseRows.map(r => r.id)
              ),
              eq(smartLinkTargets.isFallback, false)
            )
          )
          .groupBy(smartLinkTargets.releaseId);
  const targetsByRelease = new Map(
    targetCounts.map(row => [row.releaseId, Number(row.n)])
  );

  const selection = readOnboardingSelection(profile.settings);
  const probe = options.probe !== false && profile.isPublic && profile.username;
  const profileUrl = probe ? `${BASE_URL}/${profile.username}` : null;
  const publicPage = profileUrl ? await probePage(profileUrl) : null;
  const smartLinkProbes = profileUrl
    ? await Promise.all(
        releaseRows
          .filter(r => r.slug)
          .slice(0, MAX_SMART_LINK_PROBES)
          .map(r => probePage(`${profileUrl}/${r.slug}`))
      )
    : [];

  return {
    profileId: profile.id,
    waitlistEntryId: profile.waitlistEntryId,
    displayName: profile.displayName,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    spotifyId: profile.spotifyId,
    selectedSpotifyArtistId: selection.id,
    selectedSpotifyArtistName: selection.name,
    personName: entry?.fullName ?? owner?.name ?? null,
    isPublic: profile.isPublic ?? false,
    releases: releaseRows.map(r => ({
      title: r.title,
      slug: r.slug,
      hasArtwork: Boolean(r.artworkUrl),
      smartLinkTargets: targetsByRelease.get(r.id) ?? 0,
    })),
    entitlement: {
      plan: owner?.plan ?? null,
      isPro: owner?.isPro ?? false,
      hasStripeSubscription: Boolean(owner?.stripeSubscriptionId),
      trialEndsAt: owner?.trialEndsAt?.toISOString() ?? null,
    },
    publicPage,
    smartLinkProbes,
  };
}

export async function readProfileCertLedger(
  backend: CertificationRecordBackend = postgresRecordBackend()
): Promise<ProfileCertLedger | null> {
  const raw = await backend.get(PROFILE_CERT_LEDGER_KEY);
  return raw === null || raw === undefined ? null : parseProfileCertLedger(raw);
}

export async function readProfileCertRecord(
  profileId: string,
  backend?: CertificationRecordBackend
): Promise<ProfileCertRecord | null> {
  const ledger = await readProfileCertLedger(backend);
  return ledger?.profiles[profileId] ?? null;
}

export async function recordProfileCertReceipt(
  receipt: ProfileCertReceipt,
  backend: CertificationRecordBackend = postgresRecordBackend()
): Promise<boolean> {
  const recordedAt = new Date().toISOString();
  return mutateCertificationRecord<ProfileCertLedger, boolean>({
    backend,
    key: PROFILE_CERT_LEDGER_KEY,
    initialize: () =>
      backend.setIfAbsent(
        PROFILE_CERT_LEDGER_KEY,
        JSON.stringify(emptyProfileCertLedger(recordedAt)),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: parseProfileCertLedger,
    validate: parseProfileCertLedger,
    error: message => new ProfileCertPersistenceError(message),
    update: ledger => {
      const next = applyProfileCertReceipt(ledger, receipt, recordedAt);
      return { ledger: next.ledger, result: next.recorded };
    },
  });
}

async function dispatchRemediation(
  receipt: ProfileCertReceipt,
  facts: ProfileCertFacts,
  ownerUserId: string | null
): Promise<void> {
  if (
    receipt.remediation.includes('import_catalog') &&
    facts.spotifyId &&
    ownerUserId
  ) {
    // Import completion re-certifies (catalog-import.server.ts), so the fix
    // event closes the loop without a sweep.
    const { runOnboardingCatalogImport } = await import(
      '@/lib/onboarding/catalog-import.server'
    );
    await runOnboardingCatalogImport({
      profileId: facts.profileId,
      spotifyArtistId: facts.spotifyId,
      spotifyArtistUrl: `https://open.spotify.com/artist/${facts.spotifyId}`,
      userId: ownerUserId,
    });
  }
  if (receipt.remediation.includes('operator_card')) {
    const failed = receipt.checks.filter(c => c.status === 'failed');
    const { submitSummerCard } = await import('@/lib/ovie/summer-cards.server');
    // Profile id and check summaries only: no email or other PII.
    await submitSummerCard({
      idempotencyKey: `profile-cert:${facts.profileId}:${receipt.endedAt}`,
      kind: 'decision',
      product: 'jov',
      title:
        `Profile certification failed: @${facts.username ?? facts.profileId}`.slice(
          0,
          120
        ),
      body: failed.map(c => `${c.id}: ${c.summary}`).join('\n'),
      recommendation:
        'Fix the failing checks in code or through the profile correction path, then re-certify.',
      defaultIfSilent:
        'The person stays off the invite queue until the profile certifies.',
      recipient: null,
      amountUsd: null,
      preflightReceiptId: null,
      evidence: [`profile-cert:${facts.profileId}`],
      decideBy: null,
      defaultDecision: 'none',
    });
  }
}

/**
 * Certify one profile: read facts, evaluate, persist a SHA-bound receipt and
 * dispatch remediation for failures. Throws only when the receipt cannot be
 * persisted (the gate must not read a missing receipt as a pass).
 */
export async function certifyProfile(input: {
  readonly profileId: string;
  readonly trigger: ProfileCertTrigger;
  readonly remediate?: boolean;
  readonly probe?: boolean;
  /** Walk recording and step screenshots from the agent dogfood run. */
  readonly evidence?: ProfileCertEvidence | null;
}): Promise<ProfileCertReceipt | null> {
  const startedAt = new Date().toISOString();
  const facts = await readProfileCertFacts(input.profileId, {
    probe: input.probe,
  });
  if (!facts) return null;
  const verdict = evaluateProfileCertification(facts);
  const build = await getDeployedBuildInfo().catch(() => null);
  const receipt: ProfileCertReceipt = {
    schema: PROFILE_CERT_RECEIPT_SCHEMA,
    profileId: facts.profileId,
    waitlistEntryId: facts.waitlistEntryId,
    status: verdict.status,
    sha: build?.commitSha ?? null,
    trigger: input.trigger,
    startedAt,
    endedAt: new Date().toISOString(),
    checks: verdict.checks,
    remediation: verdict.remediation,
    evidence: input.evidence ?? null,
  };
  await recordProfileCertReceipt(receipt);
  logger.info('[profile-certification] certified', {
    profileId: receipt.profileId,
    status: receipt.status,
    trigger: receipt.trigger,
    sha: receipt.sha,
  });

  if (input.remediate !== false) {
    const [owner] = await db
      .select({ userId: creatorProfiles.userId })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, facts.profileId))
      .limit(1);
    try {
      // A catalog import re-certifies on completion; a failure after an
      // import goes to an operator instead of looping back into the import.
      const afterImport = input.trigger === 'catalog_import';
      await dispatchRemediation(
        afterImport && receipt.remediation.includes('import_catalog')
          ? {
              ...receipt,
              remediation: [
                ...receipt.remediation.filter(r => r !== 'import_catalog'),
                'operator_card',
              ],
            }
          : receipt,
        facts,
        owner?.userId ?? null
      );
    } catch (error) {
      await captureError('Profile certification remediation failed', error, {
        profileId: facts.profileId,
      });
    }
  }
  return receipt;
}

export async function certifyWaitlistEntry(input: {
  readonly entryId: string;
  readonly trigger: ProfileCertTrigger;
  readonly remediate?: boolean;
  readonly evidence?: ProfileCertEvidence | null;
}): Promise<
  | { readonly outcome: 'no_profile' }
  | { readonly outcome: 'certified'; readonly receipt: ProfileCertReceipt }
> {
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.waitlistEntryId, input.entryId))
    .limit(1);
  if (!profile) return { outcome: 'no_profile' };
  const receipt = await certifyProfile({
    profileId: profile.id,
    trigger: input.trigger,
    remediate: input.remediate,
    evidence: input.evidence,
  });
  return receipt
    ? { outcome: 'certified', receipt }
    : { outcome: 'no_profile' };
}

/** Event hook: certify after the response. Never throws. */
export function scheduleProfileCertification(input: {
  readonly profileId: string;
  readonly trigger: ProfileCertTrigger;
}): void {
  scheduleAfter(async () => {
    try {
      await certifyProfile(input);
    } catch (error) {
      await captureError('Profile certification failed', error, {
        profileId: input.profileId,
        trigger: input.trigger,
      });
    }
  });
}

export interface WaitlistInviteGate {
  readonly profileId: string;
  readonly certified: boolean;
  /** When the latest receipt was written; null when never certified. */
  readonly certifiedAt: string | null;
}

/**
 * Waitlist invite gate: entry id -> its profile and whether that profile's
 * latest certification passed. Entries without a profile are absent. An
 * unreadable ledger certifies nobody (fail closed).
 */
export async function readWaitlistInviteGates(
  entryIds: readonly string[]
): Promise<
  ReadonlyMap<
    string,
    { readonly profileId: string; readonly certified: boolean }
  >
> {
  const gates = new Map<string, { profileId: string; certified: boolean }>();
  if (entryIds.length === 0) return gates;
  const profiles = await db
    .select({
      id: creatorProfiles.id,
      entryId: creatorProfiles.waitlistEntryId,
    })
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.waitlistEntryId, [...entryIds]));
  const ledger = await readProfileCertLedger().catch(error => {
    logger.warn('[profile-certification] ledger unreadable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  for (const profile of profiles) {
    if (!profile.entryId) continue;
    const latest = ledger?.profiles[profile.id]?.latest;
    gates.set(profile.entryId, {
      profileId: profile.id,
      certified: isProfileCertifiedForInvite(latest),
      certifiedAt: latest?.endedAt ?? null,
    });
  }
  return gates;
}
