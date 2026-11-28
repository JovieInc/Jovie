import { z } from 'zod';
import type { AudienceBand } from '@/lib/chat/tools/onboarding-signals';
import { audienceBandSchema } from '@/lib/chat/tools/onboarding-signals';

/**
 * Optional post-Keep enrichment notes (ONB-26).
 * Client sessionStorage bridge so chip notes survive AuthShell → claim →
 * /waitlist remount without restoring required social→audience.
 */

export const POST_KEEP_ENRICHMENT_STORAGE_KEY =
  'jovie:onboarding:enrichment:v1' as const;

const socialPlatformSchema = z.enum(['instagram', 'tiktok']);

export const postKeepEnrichmentNotesSchema = z.object({
  platform: socialPlatformSchema.nullable().optional(),
  audienceBand: audienceBandSchema.nullable().optional(),
  socialUrl: z.string().trim().url().max(500).nullable().optional(),
  notedAt: z.string().datetime().optional(),
});

export type PostKeepEnrichmentNotes = z.infer<
  typeof postKeepEnrichmentNotesSchema
>;

export type PostKeepSocialPlatform = z.infer<typeof socialPlatformSchema>;

const ALLOWED_HOSTS: Record<PostKeepSocialPlatform, readonly string[]> = {
  instagram: ['instagram.com', 'www.instagram.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
};

export function isAllowedEnrichmentSocialUrl(
  raw: string,
  platform: PostKeepSocialPlatform | null | undefined
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  if (platform) {
    return ALLOWED_HOSTS[platform].includes(host);
  }
  return Object.values(ALLOWED_HOSTS).some(hosts => hosts.includes(host));
}

export function readPostKeepEnrichmentNotes(): PostKeepEnrichmentNotes | null {
  if (typeof globalThis.sessionStorage === 'undefined') return null;
  try {
    const raw = globalThis.sessionStorage.getItem(
      POST_KEEP_ENRICHMENT_STORAGE_KEY
    );
    if (!raw) return null;
    const parsed = postKeepEnrichmentNotesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writePostKeepEnrichmentNotes(
  patch: Partial<PostKeepEnrichmentNotes>
): PostKeepEnrichmentNotes {
  const current = readPostKeepEnrichmentNotes() ?? {};
  const next: PostKeepEnrichmentNotes = {
    ...current,
    ...patch,
    notedAt: new Date().toISOString(),
  };
  if (typeof globalThis.sessionStorage !== 'undefined') {
    try {
      globalThis.sessionStorage.setItem(
        POST_KEEP_ENRICHMENT_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Private mode / quota — in-memory return still lets this claim attempt
      // carry notes from the same document.
    }
  }
  return next;
}

export function clearPostKeepEnrichmentNotes(): void {
  if (typeof globalThis.sessionStorage === 'undefined') return;
  try {
    globalThis.sessionStorage.removeItem(POST_KEEP_ENRICHMENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Prefer a valid chip URL; otherwise keep the existing claim fallback. */
export function resolvePrimarySocialUrlForWaitlist(params: {
  readonly fallbackUrl: string | null | undefined;
  readonly enrichment: PostKeepEnrichmentNotes | null | undefined;
}): string | null {
  const url = params.enrichment?.socialUrl?.trim();
  if (
    url &&
    isAllowedEnrichmentSocialUrl(url, params.enrichment?.platform ?? null)
  ) {
    return url;
  }
  return params.fallbackUrl?.trim() || null;
}

export function enrichmentQualificationPatch(
  enrichment: PostKeepEnrichmentNotes | null | undefined
): Record<string, unknown> | null {
  if (!enrichment) return null;
  const platform = enrichment.platform ?? null;
  const audienceBand = (enrichment.audienceBand ?? null) as AudienceBand | null;
  const socialUrl = enrichment.socialUrl?.trim() || null;
  if (!platform && !audienceBand && !socialUrl) return null;
  return {
    postKeepEnrichment: {
      platform,
      audienceBand,
      socialUrl,
      notedAt: enrichment.notedAt ?? new Date().toISOString(),
    },
  };
}
