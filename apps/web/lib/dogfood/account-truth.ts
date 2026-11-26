/**
 * Dogfood account truth (JOV-7140): the design partner's own account, checked
 * against the outside world every day. Read only. Each finding has a stable
 * key, so the loop that calls this files one Linear issue per key while it is
 * red and resolves that issue once the key stops appearing.
 *
 * Checks:
 *  - Apple Music catalog: every Apple album is in the Library, and every
 *    match is publicly visible (or was hidden by the artist).
 *  - Apple scan freshness: the weekly completeness sweep ran and settled.
 *  - Catalog cycle: a Release-to-Revenue run exists inside the cycle window.
 */
import 'server-only';

import { and, desc, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { discogReleases } from '@/lib/db/schema/content';
import { dspCatalogScans } from '@/lib/db/schema/dsp-catalog-scan';
import { libraryAssetApprovalStatuses } from '@/lib/db/schema/library';
import {
  type AppleCatalogAlbum,
  cleanAppleAlbumTitle,
  selectMissingAppleAlbums,
} from '@/lib/discography/apple-music-catalog';
import { loadLibrary } from '@/lib/discography/apple-music-import';
import { getBoundAppleMusicArtistId } from '@/lib/dsp-enrichment/apple-music-target';
import {
  getArtistAlbums,
  isAppleMusicAvailable,
} from '@/lib/dsp-enrichment/providers/apple-music';
import { getAppFlagValue } from '@/lib/flags/server';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { AUTOPILOT_CYCLE_DAYS } from '@/lib/release-to-revenue/autostart';
import { resolveDesignPartnerConfig } from '@/lib/release-to-revenue/design-partner-config';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '@/lib/release-to-revenue/types';

export interface AccountTruthFinding {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly evidence: Record<string, unknown>;
}

export interface AccountTruthReport {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly creatorUsername: string | null;
  readonly checks: readonly string[];
  readonly findings: readonly AccountTruthFinding[];
}

const APPLE_PROVIDER = 'apple_music';
/** The sweep rechecks weekly; one extra day absorbs a skipped run. */
const APPLE_SCAN_MAX_AGE_MS = 8 * 86_400_000;
const DAY_MS = 86_400_000;

type LibraryRow = Awaited<ReturnType<typeof loadLibrary>>[number];

/** Why a Library row is not on the public profile; [] when it is public. */
export async function hiddenReasons(
  creatorProfileId: string,
  releaseIds: readonly string[]
): Promise<Map<string, string[]>> {
  const reasons = new Map<string, string[]>();
  if (releaseIds.length === 0) return reasons;
  const rows = await db
    .select({
      id: discogReleases.id,
      deletedAt: discogReleases.deletedAt,
      status: discogReleases.status,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
      eligible: drizzleSql<boolean>`(${publicReleaseEligibilitySqlPredicate() ?? drizzleSql`false`})`,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        inArray(discogReleases.id, [...releaseIds])
      )
    );
  const approvals = await db
    .select({
      assetId: libraryAssetApprovalStatuses.assetId,
      approvalStatus: libraryAssetApprovalStatuses.approvalStatus,
      profileVisibility: libraryAssetApprovalStatuses.profileVisibility,
    })
    .from(libraryAssetApprovalStatuses)
    .where(
      and(
        eq(libraryAssetApprovalStatuses.creatorProfileId, creatorProfileId),
        inArray(libraryAssetApprovalStatuses.assetId, [...releaseIds])
      )
    );
  const approvalById = new Map(approvals.map(a => [a.assetId, a]));
  for (const row of rows) {
    if (row.eligible) {
      reasons.set(row.id, []);
      continue;
    }
    const why: string[] = [];
    if (row.deletedAt) why.push('archived');
    if (row.status === 'draft') why.push('draft');
    if (!row.releaseDate) why.push('no-release-date');
    if (!row.artworkUrl?.trim()) why.push('no-artwork');
    const approval = approvalById.get(row.id);
    if (!approval) why.push('no-approval-row');
    else if (approval.profileVisibility !== 'visible')
      why.push('hidden-by-artist');
    else if (approval.approvalStatus !== 'approved')
      why.push(`approval-${approval.approvalStatus}`);
    reasons.set(row.id, why.length > 0 ? why : ['other-eligibility-rule']);
  }
  return reasons;
}

/** Apple albums matched only by rows that are not public, by album title. */
function matchRows(album: AppleCatalogAlbum, library: readonly LibraryRow[]) {
  return library.filter(
    row => selectMissingAppleAlbums([album], [row]).length === 0
  );
}

async function checkAppleCatalog(
  creatorProfileId: string,
  now: Date,
  findings: AccountTruthFinding[]
) {
  if (!isAppleMusicAvailable()) {
    findings.push({
      key: 'dogfood-apple-unavailable',
      title: 'Apple Music is not configured or its circuit is open',
      detail:
        'The catalog completeness sweep returns without checking anyone while Apple Music is unavailable.',
      evidence: {},
    });
    return;
  }
  const artistId = await getBoundAppleMusicArtistId(db, creatorProfileId);
  if (!artistId) {
    findings.push({
      key: 'dogfood-apple-unbound',
      title: 'No Apple Music artist is bound to the design partner profile',
      detail:
        'Without a bound artist the sweep records no_authority and imports nothing.',
      evidence: {},
    });
    return;
  }

  const [scan] = await db
    .select({
      status: dspCatalogScans.status,
      error: dspCatalogScans.error,
      missingCount: dspCatalogScans.missingCount,
      createdAt: dspCatalogScans.createdAt,
    })
    .from(dspCatalogScans)
    .where(
      and(
        eq(dspCatalogScans.creatorProfileId, creatorProfileId),
        eq(dspCatalogScans.providerId, APPLE_PROVIDER)
      )
    )
    .orderBy(desc(dspCatalogScans.createdAt))
    .limit(1);
  const scanAge = scan ? now.getTime() - scan.createdAt.getTime() : null;
  if (
    !scan ||
    scan.status !== 'completed' ||
    (scanAge ?? Infinity) > APPLE_SCAN_MAX_AGE_MS
  ) {
    findings.push({
      key: 'dogfood-apple-scan-stale',
      title: 'The weekly Apple Music completeness scan has not settled',
      detail: scan
        ? `Latest scan ${scan.status} ${Math.round((scanAge ?? 0) / DAY_MS)} days ago.`
        : 'No Apple Music scan has ever run for this profile.',
      evidence: scan
        ? {
            status: scan.status,
            error: scan.error,
            missingCount: scan.missingCount,
            at: scan.createdAt.toISOString(),
          }
        : {},
    });
  }

  const albums = (await getArtistAlbums(
    artistId,
    {},
    100
  )) as AppleCatalogAlbum[];
  const library = await loadLibrary(db, creatorProfileId);
  const missing = selectMissingAppleAlbums(albums, library);
  if (missing.length > 0) {
    findings.push({
      key: 'dogfood-catalog-missing',
      title: `${missing.length} Apple Music releases are not in the Library`,
      detail: 'The completeness sweep should have imported these.',
      evidence: {
        titles: missing.map(a => cleanAppleAlbumTitle(a.attributes.name)),
      },
    });
  }

  const missingIds = new Set(missing.map(a => a.id));
  const matched = albums
    .filter(a => !missingIds.has(a.id))
    .map(a => ({ album: a, rows: matchRows(a, library) }))
    .filter(m => m.rows.length > 0);
  const reasons = await hiddenReasons(
    creatorProfileId,
    matched.flatMap(m => m.rows.map(r => r.id))
  );
  const hidden = matched.flatMap(({ album, rows }) => {
    const rowReasons = rows.map(r => reasons.get(r.id) ?? ['unknown']);
    // Public if any matching row is public, or the artist hid it on purpose.
    if (rowReasons.some(r => r.length === 0 || r.includes('hidden-by-artist')))
      return [];
    return [
      {
        title: cleanAppleAlbumTitle(album.attributes.name),
        reasons: [...new Set(rowReasons.flat())],
      },
    ];
  });
  if (hidden.length > 0) {
    findings.push({
      key: 'dogfood-catalog-hidden',
      title: `${hidden.length} Apple Music releases are in the Library but not public`,
      detail:
        'Each one is matched only by Library rows the public profile filters out.',
      evidence: { releases: hidden },
    });
  }
}

async function checkCatalogCycle(
  userId: string,
  creatorProfileId: string,
  now: Date,
  findings: AccountTruthFinding[]
) {
  const enabled = await getAppFlagValue('RELEASE_TO_REVENUE_AUTOPILOT', {
    userId,
  });
  const since = new Date(now.getTime() - AUTOPILOT_CYCLE_DAYS * DAY_MS);
  const [run] = await db
    .select({
      id: workflowRuns.id,
      status: workflowRuns.status,
      currentStep: workflowRuns.currentStep,
      error: workflowRuns.error,
      createdAt: workflowRuns.createdAt,
      releaseId: drizzleSql<
        string | null
      >`${workflowRuns.stepOutputs} ->> 'releaseId'`,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.userId, userId),
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND),
        drizzleSql`${workflowRuns.createdAt} > ${since}`
      )
    )
    .orderBy(desc(workflowRuns.createdAt))
    .limit(1);

  if (!run) {
    const [focus] = await db
      .select({ title: discogReleases.title })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          eq(discogReleases.status, 'released'),
          drizzleSql`${discogReleases.deletedAt} IS NULL`
        )
      )
      .orderBy(drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`)
      .limit(1);
    findings.push({
      key: 'dogfood-cycle-not-running',
      title: `No catalog cycle in the last ${AUTOPILOT_CYCLE_DAYS} days`,
      detail: enabled
        ? 'The autopilot flag is on, so the daily autostart should have started one.'
        : 'The RELEASE_TO_REVENUE_AUTOPILOT flag is off for this user.',
      evidence: { flagEnabled: enabled, focusRelease: focus?.title ?? null },
    });
    return;
  }
  if (run.status === 'failed') {
    findings.push({
      key: 'dogfood-cycle-failed',
      title: 'The latest catalog cycle failed',
      detail: run.error ?? 'No error recorded.',
      evidence: {
        runId: run.id,
        step: run.currentStep,
        at: run.createdAt.toISOString(),
      },
    });
  }
}

export async function checkDesignPartnerAccountTruth(
  now = new Date()
): Promise<AccountTruthReport> {
  const findings: AccountTruthFinding[] = [];
  const checks: string[] = [];
  const partner = await resolveDesignPartnerConfig();
  if (!partner) {
    findings.push({
      key: 'dogfood-design-partner-missing',
      title: 'The design partner profile does not resolve',
      detail:
        'No creator profile matches the configured design partner handle.',
      evidence: {},
    });
    return {
      ok: false,
      checkedAt: now.toISOString(),
      creatorUsername: null,
      checks: ['design-partner'],
      findings,
    };
  }
  checks.push('design-partner');
  await checkAppleCatalog(partner.creatorProfileId, now, findings);
  checks.push('apple-catalog');
  await checkCatalogCycle(
    partner.userId,
    partner.creatorProfileId,
    now,
    findings
  );
  checks.push('catalog-cycle');
  return {
    ok: findings.length === 0,
    checkedAt: now.toISOString(),
    creatorUsername: partner.creatorUsername,
    checks,
    findings,
  };
}
