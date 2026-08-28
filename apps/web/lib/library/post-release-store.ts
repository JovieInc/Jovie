import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  libraryPresenceFindings,
  libraryRightsholderEvidence,
} from '@/lib/db/schema/library-presence';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import {
  type PresenceFindingAction,
  transitionPresenceFinding,
} from './post-release';
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

export async function listLibraryPostReleaseBundle(
  creatorProfileId: string
): Promise<LibraryPostReleaseBundle> {
  const [downloads, findings, rightsholders] = await Promise.all([
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
  ]);

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
  };
}

export async function applyPresenceFindingAction(input: {
  readonly creatorProfileId: string;
  readonly findingId: string;
  readonly actorUserId: string;
  readonly action: PresenceFindingAction;
}): Promise<LibraryPresenceFindingView | null> {
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
  if (!finding) return null;
  const transition = transitionPresenceFinding(finding, input.action);
  if (!transition.ok) return null;
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
  return updated ? toFindingView(updated) : null;
}
