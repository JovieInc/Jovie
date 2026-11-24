import type { PostKeepEnrichmentNotes } from '@/lib/onboarding/post-keep-enrichment-notes';
import {
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
