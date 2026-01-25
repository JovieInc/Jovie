import * as Sentry from '@sentry/nextjs';
import { and, eq, gt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { dashboardIdempotencyKeys, socialLinks } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS, TTL } from '@/lib/http/headers';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';
import { maybeSetProfileAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import {
  createRateLimitHeaders,
  dashboardLinksRateLimit,
} from '@/lib/rate-limit';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import {
  updateSocialLinksSchema as baseUpdateSocialLinksSchema,
  updateLinkStateSchema,
} from '@/lib/validation/schemas';
import { isValidSocialPlatform } from '@/types';
import type { IngestionSourceType, SocialLinkState } from '@/types/db';

const IDEMPOTENCY_KEY_TTL_MS = TTL.IDEMPOTENCY_KEY_MS;

const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT';
const DEFAULT_SOURCE_TYPE: IngestionSourceType = 'manual';

type LinkEvidencePayload = {
  sources: string[];
  signals: string[];
};

type LinkInput = {
  platform: string;
  url: string;
  sortOrder?: number | null;
  isActive?: boolean | null;
  displayText?: string | null;
  state?: SocialLinkState | null;
  confidence?: number | null;
  sourcePlatform?: string | null;
  sourceType?: IngestionSourceType | null;
  evidence?: Partial<LinkEvidencePayload> | null;
};

type UpdateSocialLinksData = z.infer<typeof updateSocialLinksSchema>;

export const updateSocialLinksSchema = baseUpdateSocialLinksSchema.superRefine(
  (data, ctx) => {
    if (data.links) {
      data.links.forEach((link, index) => {
        if (!isValidSocialPlatform(link.platform)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid platform',
            path: ['links', index, 'platform'],
          });
        }
      });
    }
  }
);

export const validateUpdateSocialLinksPayload = (
  rawBody: unknown,
  headers: HeadersInit
):
  | { ok: true; data: UpdateSocialLinksData }
  | { ok: false; response: NextResponse } => {
  if (rawBody == null || typeof rawBody !== 'object') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers }
      ),
    };
  }

  const parsed = updateSocialLinksSchema.safeParse(rawBody);
  if (!parsed.success) {
    const hasInvalidPlatform = parsed.error.issues.some(
      issue => issue.message === 'Invalid platform'
    );
    const message = hasInvalidPlatform
      ? 'Invalid platform'
      : 'Invalid request body';
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: 400, headers }),
    };
  }

  return { ok: true, data: parsed.data };
};

export async function applyRateLimiting(
  userId: string
): Promise<{ allowed: boolean; headers: HeadersInit }> {
  if (!dashboardLinksRateLimit) {
    return { allowed: true, headers: {} };
  }

  const result = await dashboardLinksRateLimit.limit(userId);
  const headers = createRateLimitHeaders({
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: new Date(result.reset),
  });

  return { allowed: result.success, headers };
}

export async function checkIdempotencyKey(
  key: string,
  userId: string,
  endpoint: string
): Promise<{ cached: boolean; response?: NextResponse }> {
  if (!key) {
    return { cached: false };
  }

  const [existing] = await db
    .select({
      responseStatus: dashboardIdempotencyKeys.responseStatus,
      responseBody: dashboardIdempotencyKeys.responseBody,
      expiresAt: dashboardIdempotencyKeys.expiresAt,
    })
    .from(dashboardIdempotencyKeys)
    .where(
      and(
        eq(dashboardIdempotencyKeys.key, key),
        eq(dashboardIdempotencyKeys.userId, userId),
        eq(dashboardIdempotencyKeys.endpoint, endpoint),
        gt(dashboardIdempotencyKeys.expiresAt, new Date())
      )
    )
    .limit(1);

  if (existing) {
    return {
      cached: true,
      response: NextResponse.json(existing.responseBody ?? { ok: true }, {
        status: existing.responseStatus,
        headers: NO_STORE_HEADERS,
      }),
    };
  }

  return { cached: false };
}

export async function storeIdempotencyKey(
  key: string,
  userId: string,
  endpoint: string,
  responseStatus: number,
  responseBody: Record<string, unknown>
): Promise<void> {
  if (!key) return;

  try {
    await db
      .insert(dashboardIdempotencyKeys)
      .values({
        key,
        userId,
        endpoint,
        responseStatus,
        responseBody,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS),
      })
      .onConflictDoNothing();
  } catch (error) {
    captureError('Failed to store idempotency key', error, {
      route: '/api/dashboard/social-links',
      action: 'idempotency',
      userId,
    });
  }
}

export function processLinkValidation(
  links: Array<{ url: string }>
): { ok: true } | { ok: false; error: string } {
  for (const link of links) {
    const validation = validateSocialLinkUrl(link.url);
    if (!validation.valid) {
      return { ok: false, error: validation.error ?? 'Invalid URL' };
    }
  }

  return { ok: true };
}

export function computeLinkVersioning(options: {
  existingVersions: Array<number | null | undefined>;
  expectedVersion?: number;
  headers: HeadersInit;
  conflictMessage: string;
  emptyVersion?: number;
}):
  | { ok: true; currentVersion: number; nextVersion: number }
  | { ok: false; response: NextResponse } {
  const resolvedVersions = options.existingVersions.map(
    version => version ?? 1
  );
  const currentVersion =
    resolvedVersions.length > 0
      ? Math.max(...resolvedVersions)
      : (options.emptyVersion ?? 0);

  if (
    options.expectedVersion !== undefined &&
    currentVersion !== options.expectedVersion
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: options.conflictMessage,
          code: VERSION_CONFLICT_CODE,
          currentVersion,
          expectedVersion: options.expectedVersion,
        },
        { status: 409, headers: options.headers }
      ),
    };
  }

  return { ok: true, currentVersion, nextVersion: currentVersion + 1 };
}

const buildEvidencePayload = (link: LinkInput): LinkEvidencePayload => ({
  sources: link.evidence?.sources ?? [],
  signals: link.evidence?.signals ?? [],
});

const scoreLinkConfidence = (
  link: LinkInput,
  normalizedUrl: string,
  evidence: LinkEvidencePayload,
  usernameNormalized: string | null
): { state: SocialLinkState; confidence: string } => {
  const scored = computeLinkConfidence({
    sourceType: link.sourceType ?? DEFAULT_SOURCE_TYPE,
    signals: evidence.signals,
    sources: [...evidence.sources, 'dashboard'],
    usernameNormalized,
    url: normalizedUrl,
    existingConfidence:
      typeof link.confidence === 'number' ? link.confidence : null,
  });

  const state =
    link.state ?? (link.isActive === false ? 'suggested' : scored.state);

  const confidence =
    typeof link.confidence === 'number'
      ? Number(link.confidence.toFixed(2))
      : scored.confidence;

  return { state, confidence: confidence.toFixed(2) };
};

export const buildSocialLinksInsertPayload = (
  links: LinkInput[],
  profileId: string,
  usernameNormalized: string | null,
  nextVersion: number
): { payload: Array<typeof socialLinks.$inferInsert>; linkUrls: string[] } => {
  const payload = links.map((link, index) => {
    const detected = detectPlatform(link.url);
    const normalizedUrl = detected.normalizedUrl;
    const evidence = buildEvidencePayload(link);
    const scored = scoreLinkConfidence(
      link,
      normalizedUrl,
      evidence,
      usernameNormalized
    );

    return {
      creatorProfileId: profileId,
      platform: link.platform,
      platformType: detected.platform.icon,
      url: normalizedUrl,
      sortOrder: link.sortOrder ?? index,
      state: scored.state,
      isActive: scored.state === 'active',
      confidence: scored.confidence,
      sourcePlatform: link.sourcePlatform,
      sourceType: link.sourceType ?? DEFAULT_SOURCE_TYPE,
      evidence: {
        ...evidence,
        sources: Array.from(new Set(evidence.sources)),
        signals: Array.from(new Set(evidence.signals)),
      },
      displayText: link.displayText || null,
      version: nextVersion,
    };
  });

  return { payload, linkUrls: payload.map(link => link.url) };
};

export const enqueueProfileEnrichment = async (options: {
  links: string[];
  profileId: string;
  clerkUserId: string;
  userId: string | null;
  avatarUrl: string | null;
  avatarLockedByUser: boolean | null;
}) => {
  if (options.links.length === 0) return;

  try {
    await maybeSetProfileAvatarFromLinks({
      db,
      clerkUserId: options.clerkUserId,
      profileId: options.profileId,
      userId: options.userId,
      currentAvatarUrl: options.avatarUrl,
      avatarLockedByUser: options.avatarLockedByUser,
      links: options.links,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: 'profile_enrichment' },
      extra: {
        profileId: options.profileId,
        clerkUserId: options.clerkUserId,
      },
    });
  }
};

export const validateLinkStatePayload = (
  rawBody: unknown,
  headers: HeadersInit
):
  | { ok: true; data: z.infer<typeof updateLinkStateSchema> }
  | { ok: false; response: NextResponse } => {
  if (rawBody == null || typeof rawBody !== 'object') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers }
      ),
    };
  }

  const parsed = updateLinkStateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers }
      ),
    };
  }

  const { profileId, linkId, action } = parsed.data;
  if (!profileId || !linkId || !action) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Profile ID, Link ID, and action are required' },
        { status: 400, headers }
      ),
    };
  }

  return { ok: true, data: parsed.data };
};
