import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import type { GeneratedPitchDraft } from '@/lib/services/pitch/types';

/** WHERE clause that re-asserts profile ownership on release writes. */
export function ownedReleaseWhere(releaseId: string, creatorProfileId: string) {
  return and(
    eq(discogReleases.id, releaseId),
    eq(discogReleases.creatorProfileId, creatorProfileId)
  );
}

export async function updateOwnedReleaseMetadata(input: {
  releaseId: string;
  creatorProfileId: string;
  metadata: Record<string, unknown>;
}): Promise<boolean> {
  const result = await db
    .update(discogReleases)
    .set({
      metadata: input.metadata,
      updatedAt: new Date(),
    })
    .where(ownedReleaseWhere(input.releaseId, input.creatorProfileId));

  return (result.rowCount ?? 0) > 0;
}

export async function updateOwnedReleaseGeneratedPitches(input: {
  releaseId: string;
  creatorProfileId: string;
  generatedPitches: GeneratedPitchDraft;
}): Promise<boolean> {
  const result = await db
    .update(discogReleases)
    .set({ generatedPitches: input.generatedPitches })
    .where(ownedReleaseWhere(input.releaseId, input.creatorProfileId));

  return (result.rowCount ?? 0) > 0;
}
