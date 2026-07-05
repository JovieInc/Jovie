import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { generateReleaseMerchDrop } from './merch-drop';
import type {
  ReleaseAutopilotRunInput,
  ReleaseAutopilotRunResult,
} from './types';

export async function runReleaseAutopilot(
  input: ReleaseAutopilotRunInput
): Promise<ReleaseAutopilotRunResult> {
  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, input.releaseId),
        eq(discogReleases.creatorProfileId, input.profileId)
      )
    )
    .limit(1);

  if (!release) {
    throw new Error('Release not found for profile');
  }

  const merchDrop = await generateReleaseMerchDrop({
    profileId: input.profileId,
    releaseId: input.releaseId,
    clerkUserId: input.clerkUserId,
  });

  return {
    releaseId: release.id,
    releaseTitle: release.title,
    merchDrop,
  };
}
