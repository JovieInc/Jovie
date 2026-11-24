import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import {
  enrichmentQualificationPatch,
  type PostKeepEnrichmentNotes,
  postKeepEnrichmentNotesSchema,
  resolvePrimarySocialUrlForWaitlist,
} from '@/lib/onboarding/post-keep-enrichment-notes';

export function parsePostKeepEnrichmentFromBody(
  body: unknown
): PostKeepEnrichmentNotes | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { enrichment?: unknown }).enrichment;
  if (raw == null) return null;
  const parsed = postKeepEnrichmentNotesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function pickWaitlistPrimarySocialUrl(params: {
  readonly stateSocialUrl: string | null | undefined;
  readonly artistUrl: string | null | undefined;
  readonly enrichment: PostKeepEnrichmentNotes | null;
}): string | null {
  return resolvePrimarySocialUrlForWaitlist({
    fallbackUrl: params.stateSocialUrl ?? params.artistUrl,
    enrichment: params.enrichment,
  });
}

/** Merge chip notes onto the durable waitlist row after receipt create. */
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
