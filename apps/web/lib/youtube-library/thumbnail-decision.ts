import 'server-only';

import { and, eq } from 'drizzle-orm';
import { YOUTUBE_THUMBNAIL_CANDIDATE_KIND } from '@/lib/connectors/suggested-action-kinds';
import {
  buildYouTubeThumbnailDecisionReceipt,
  parseYouTubeThumbnailCandidate,
  type YouTubeThumbnailDecision,
} from '@/lib/connectors/youtube-thumbnail-candidate';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import {
  youtubeThumbnailVersions,
  youtubeVideos,
} from '@/lib/db/schema/youtube-library';

export class YouTubeThumbnailDecisionError extends Error {
  constructor(
    readonly code:
      | 'invalid-candidate-payload'
      | 'candidate-not-found'
      | 'candidate-already-decided'
  ) {
    super(code);
  }
}

/** Reconcile the thumbnail row and durable receipt after an Inbox CAS. */
export async function reconcileThumbnailCandidateDecision(input: {
  readonly suggestedActionId: string;
  readonly userId: string;
  readonly payload: unknown;
  readonly decision: YouTubeThumbnailDecision;
  readonly decidedAt?: Date;
}) {
  const payload = parseYouTubeThumbnailCandidate(
    YOUTUBE_THUMBNAIL_CANDIDATE_KIND,
    input.payload
  );
  if (!payload) {
    throw new YouTubeThumbnailDecisionError('invalid-candidate-payload');
  }

  const [candidate] = await db
    .select({ approvalStatus: youtubeThumbnailVersions.approvalStatus })
    .from(youtubeThumbnailVersions)
    .innerJoin(
      youtubeVideos,
      eq(youtubeVideos.id, youtubeThumbnailVersions.videoId)
    )
    .where(
      and(
        eq(youtubeThumbnailVersions.id, payload.candidateThumbnailVersionId),
        eq(youtubeVideos.creatorProfileId, payload.creatorProfileId),
        eq(youtubeVideos.channelId, payload.channelId),
        eq(youtubeVideos.videoId, payload.youtubeVideoId)
      )
    )
    .limit(1);
  if (!candidate) {
    throw new YouTubeThumbnailDecisionError('candidate-not-found');
  }

  const desiredStatus = input.decision;
  if (
    candidate.approvalStatus !== 'pending' &&
    candidate.approvalStatus !== desiredStatus
  ) {
    throw new YouTubeThumbnailDecisionError('candidate-already-decided');
  }

  const decidedAt = input.decidedAt ?? new Date();
  if (candidate.approvalStatus === 'pending') {
    await db
      .update(youtubeThumbnailVersions)
      .set({
        approvalStatus: desiredStatus,
        ...(desiredStatus === 'approved'
          ? { approvedBy: input.userId, approvedAt: decidedAt }
          : {}),
      })
      .where(
        and(
          eq(youtubeThumbnailVersions.id, payload.candidateThumbnailVersionId),
          eq(youtubeThumbnailVersions.approvalStatus, 'pending')
        )
      );
  }

  const receipt = buildYouTubeThumbnailDecisionReceipt({
    payload,
    decision: input.decision,
    decidedAt,
  });
  await db
    .update(suggestedActions)
    .set({ executionResult: receipt })
    .where(
      and(
        eq(suggestedActions.id, input.suggestedActionId),
        eq(suggestedActions.userId, input.userId)
      )
    );
  return receipt;
}
