import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { optimizationExperiments } from '@/lib/db/schema/library-content-graph';
import {
  type LibraryPresenceFinding,
  libraryPresenceFindings,
  libraryRightsholderEvidence,
} from '@/lib/db/schema/library-presence';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import { captureError } from '@/lib/error-tracking';
import {
  type PresenceActionFailureReason,
  type PresenceFindingAction,
  transitionPresenceFinding,
} from './post-release';
import {
  libraryPostReleaseVariantIdentity,
  parseOptimizationVariantKeys,
} from './post-release-optimization';
import type {
  LibraryPostReleaseBundle,
  LibraryPresenceFindingView,
} from './post-release-types';

function toFindingView(
  finding: typeof libraryPresenceFindings.$inferSelect
): LibraryPresenceFindingView {
  return {
    id: finding.id,
    subjectType: finding.subjectType,
    subjectId: finding.subjectId,
    kind: finding.kind,
    issueType: finding.issueType,
    platform: finding.platform,
    title: finding.title,
    currentUrl: finding.currentUrl,
    expectedUrl: finding.expectedUrl,
    actionMode: finding.actionMode,
    status: finding.status,
    collisionDisposition: finding.collisionDisposition,
    draftRequest: finding.draftRequest,
  };
}

function toLibraryEntityType(
  subjectType: LibraryPresenceFindingView['subjectType']
): 'artist' | 'release' | 'recording' {
  return subjectType === 'track' ? 'recording' : subjectType;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function listLibraryPostReleaseBundle(
  creatorProfileId: string
): Promise<LibraryPostReleaseBundle> {
  const [downloads, findings, rightsholders, accounts] = await Promise.all([
    db
      .select({
        id: promoDownloads.id,
        releaseId: promoDownloads.releaseId,
        title: promoDownloads.title,
        fileName: promoDownloads.fileName,
      })
      .from(promoDownloads)
      .where(
        and(
          eq(promoDownloads.creatorProfileId, creatorProfileId),
          eq(promoDownloads.isActive, true),
          eq(promoDownloads.rightsControlAttested, true)
        )
      )
      .orderBy(promoDownloads.position),
    db
      .select()
      .from(libraryPresenceFindings)
      .where(eq(libraryPresenceFindings.creatorProfileId, creatorProfileId))
      .orderBy(desc(libraryPresenceFindings.detectedAt)),
    db
      .select()
      .from(libraryRightsholderEvidence)
      .where(eq(libraryRightsholderEvidence.creatorProfileId, creatorProfileId))
      .orderBy(desc(libraryRightsholderEvidence.capturedAt)),
    db
      .select({
        provider: connectorAccounts.provider,
        status: connectorAccounts.status,
      })
      .from(connectorAccounts)
      .where(eq(connectorAccounts.creatorProfileId, creatorProfileId)),
  ]);

  const youtubeConnected = accounts.some(
    account => account.provider === 'youtube' && account.status === 'connected'
  );

  return {
    downloads,
    findings: findings.map(toFindingView),
    rightsholders: rightsholders.map(item => ({
      id: item.id,
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      partyName: item.partyName,
      role: item.role,
      domain: item.domain,
      evidenceClass: item.evidenceClass,
      source: item.source,
      shareBps: item.shareBps,
    })),
    stats: [
      { platform: 'youtube', connected: youtubeConnected, measurements: [] },
    ],
  };
}

export type ApplyPresenceFindingResult =
  | { readonly ok: true; readonly finding: LibraryPresenceFindingView }
  | { readonly ok: false; readonly reason: PresenceActionFailureReason };

export async function applyPresenceFindingAction(input: {
  readonly creatorProfileId: string;
  readonly findingId: string;
  readonly actorUserId: string;
  readonly action: PresenceFindingAction;
}): Promise<ApplyPresenceFindingResult> {
  const [finding] = await db
    .select()
    .from(libraryPresenceFindings)
    .where(
      and(
        eq(libraryPresenceFindings.id, input.findingId),
        eq(libraryPresenceFindings.creatorProfileId, input.creatorProfileId)
      )
    )
    .limit(1);
  if (!finding) return { ok: false, reason: 'not_found' };
  const transition = transitionPresenceFinding(finding, input.action);
  if (!transition.ok) return { ok: false, reason: transition.reason };
  const now = new Date();
  const [updated] = await db
    .update(libraryPresenceFindings)
    .set({
      status: transition.status,
      collisionDisposition: transition.collisionDisposition,
      reviewedBy: input.actorUserId,
      reviewedAt: now,
      resolvedAt: transition.status === 'resolved' ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(libraryPresenceFindings.id, input.findingId),
        eq(libraryPresenceFindings.creatorProfileId, input.creatorProfileId)
      )
    )
    .returning();
  if (!updated) return { ok: false, reason: 'not_found' };
  try {
    await writePresenceDecision({
      creatorProfileId: input.creatorProfileId,
      finding,
      action: input.action,
      status: transition.status,
      now,
    });
  } catch (error) {
    await captureError(
      'Library post-release experiment writeback failed',
      error,
      {
        route: '/api/library/post-release',
        findingId: input.findingId,
      }
    );
  }
  return { ok: true, finding: toFindingView(updated) };
}

async function writePresenceDecision(input: {
  readonly creatorProfileId: string;
  readonly finding: typeof libraryPresenceFindings.$inferSelect;
  readonly action: PresenceFindingAction;
  readonly status: LibraryPresenceFinding['status'];
  readonly now: Date;
}): Promise<void> {
  const experiments = optimizationExperiments;
  const [experiment] = await db
    .select({
      id: experiments.id,
      variants: experiments.variants,
      decisionEvidence: experiments.decisionEvidence,
    })
    .from(experiments)
    .where(
      and(
        eq(experiments.creatorProfileId, input.creatorProfileId),
        eq(
          experiments.subjectType,
          toLibraryEntityType(input.finding.subjectType)
        ),
        eq(experiments.subjectId, input.finding.subjectId),
        eq(experiments.status, 'running')
      )
    )
    .limit(1);
  if (!experiment) return;

  const variantKey =
    parseOptimizationVariantKeys(experiment.variants)[0] ?? 'control';
  const existing = isJsonRecord(experiment.decisionEvidence)
    ? experiment.decisionEvidence
    : {};
  await db
    .update(experiments)
    .set({
      decisionEvidence: {
        ...existing,
        presenceFindingId: input.finding.id,
        action: input.action,
        status: input.status,
        variantIdentity: libraryPostReleaseVariantIdentity({
          kind: input.finding.kind,
          canonicalId: input.finding.subjectId,
          experimentId: experiment.id,
          variantKey,
        }),
        autoPromoted: false,
        recordedAt: input.now.toISOString(),
      },
      updatedAt: input.now,
    })
    .where(eq(experiments.id, experiment.id));
}
