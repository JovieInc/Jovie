import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import {
  enrichmentQualificationPatch,
  type PostKeepEnrichmentNotes,
} from '@/lib/onboarding/post-keep-enrichment-notes';

/** Merge optional chip notes onto the durable waitlist row after receipt create. */
export async function mergePostKeepEnrichmentOntoWaitlistEntry(params: {
  readonly entryId: string;
  readonly enrichment: PostKeepEnrichmentNotes | null;
}): Promise<void> {
  const patch = enrichmentQualificationPatch(params.enrichment);
  if (!patch) return;
  const patchJson = JSON.stringify(patch);
  await db
    .update(waitlistEntries)
    .set({
      qualificationInputs: drizzleSql`coalesce(${waitlistEntries.qualificationInputs}, '{}'::jsonb) || ${patchJson}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(waitlistEntries.id, params.entryId));
}
