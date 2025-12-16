import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, socialLinks, users } from '@/lib/db/schema';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';
import {
  enqueueBeaconsIngestionJob,
  enqueueLayloIngestionJob,
  enqueueLinktreeIngestionJob,
  enqueueYouTubeIngestionJob,
} from '@/lib/ingestion/jobs';
import {
  isBeaconsUrl,
  validateBeaconsUrl,
} from '@/lib/ingestion/strategies/beacons';
import { isLayloUrl } from '@/lib/ingestion/strategies/laylo';
import { isLinktreeUrl } from '@/lib/ingestion/strategies/linktree';
import { validateYouTubeChannelUrl } from '@/lib/ingestion/strategies/youtube';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { isValidSocialPlatform } from '@/types';

// flags import removed - pre-launch

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(req: Request) {
  // Feature flag check removed - social links enabled by default
  try {
    return await withDbSession(async clerkUserId => {
      const url = new URL(req.url);
      const profileId = url.searchParams.get('profileId');
      if (!profileId) {
        return NextResponse.json(
          { error: 'Missing profileId' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      // Verify the profile belongs to the authenticated user before checking cache
      const [profile] = await db
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const rows = await db
        .select({
          profileId: creatorProfiles.id,
          linkId: socialLinks.id,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .leftJoin(
          socialLinks,
          eq(socialLinks.creatorProfileId, creatorProfiles.id)
        )
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .orderBy(socialLinks.sortOrder);

      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const links = rows
        .filter(r => r.linkId !== null)
        .map(r => {
          const state =
            (r.state as 'active' | 'suggested' | 'rejected' | null) ??
            (r.isActive ? 'active' : 'suggested');
          if (state === 'rejected') return null;

          const parsedConfidence =
            typeof r.confidence === 'number'
              ? r.confidence
              : Number.parseFloat(String(r.confidence ?? '0'));
          return {
            id: r.linkId!,
            platform: r.platform!,
            platformType: r.platformType!,
            url: r.url!,
            sortOrder: r.sortOrder!,
            isActive: state === 'active',
            displayText: r.displayText,
            state,
            confidence: Number.isFinite(parsedConfidence)
              ? parsedConfidence
              : 0,
            sourcePlatform: r.sourcePlatform,
            sourceType: r.sourceType ?? 'manual',
            evidence: r.evidence,
          };
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));

      return NextResponse.json(
        { links },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    console.error('Error fetching social links:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

const updateSocialLinksSchema = z.object({
  profileId: z.string().min(1),
  links: z
    .array(
      z.object({
        platform: z
          .string()
          .min(1)
          .refine(isValidSocialPlatform, { message: 'Invalid platform' }),
        platformType: z.string().min(1).optional(),
        url: z.string().min(1).max(2048),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
        displayText: z.string().max(256).optional(),
        state: z.enum(['active', 'suggested', 'rejected']).optional(),
        confidence: z.number().min(0).max(1).optional(),
        sourcePlatform: z.string().max(128).optional(),
        sourceType: z.enum(['manual', 'admin', 'ingested']).optional(),
        evidence: z
          .object({
            sources: z.array(z.string()).optional(),
            signals: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .max(100)
    .optional(),
});

const updateLinkStateSchema = z.object({
  profileId: z.string().min(1),
  linkId: z.string().min(1),
  action: z.enum(['accept', 'dismiss']),
});

export async function PUT(req: Request) {
  // Feature flag check removed - social links enabled by default
  try {
    return await withDbSession(async clerkUserId => {
      const rawBody = await req.json().catch(() => null);
      if (rawBody == null || typeof rawBody !== 'object') {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const parsed = updateSocialLinksSchema.safeParse(rawBody);
      if (!parsed.success) {
        const issues = parsed.error.issues;
        const hasInvalidPlatform = issues.some(
          issue => issue.message === 'Invalid platform'
        );
        const message = hasInvalidPlatform
          ? 'Invalid platform'
          : 'Invalid request body';
        return NextResponse.json(
          { error: message },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { profileId, links: parsedLinks } = parsed.data;
      const links = parsedLinks ?? [];
      if (!profileId) {
        return NextResponse.json(
          { error: 'Missing profileId' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      // Verify the profile belongs to the authenticated user
      const [profile] = await db
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Validate URLs before proceeding
      const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
      for (const link of links) {
        try {
          const url = new URL(link.url);
          const protocol = url.protocol.toLowerCase();

          if (dangerousProtocols.includes(protocol)) {
            return NextResponse.json(
              {
                error: `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
              },
              { status: 400, headers: NO_STORE_HEADERS }
            );
          }

          if (protocol !== 'http:' && protocol !== 'https:') {
            return NextResponse.json(
              {
                error: `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
              },
              { status: 400, headers: NO_STORE_HEADERS }
            );
          }
        } catch {
          return NextResponse.json(
            { error: `Invalid URL format: ${link.url}` },
            { status: 400, headers: NO_STORE_HEADERS }
          );
        }
      }

      // Delete only manual/admin links to preserve ingested suggestions
      const existingLinks = await db
        .select({
          id: socialLinks.id,
          sourceType: socialLinks.sourceType,
        })
        .from(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));

      const removableIds = existingLinks
        .filter(link => (link.sourceType ?? 'manual') !== 'ingested')
        .map(link => link.id);

      if (removableIds.length > 0) {
        await db
          .delete(socialLinks)
          .where(inArray(socialLinks.id, removableIds));
      }

      // Insert new links
      if (links.length > 0) {
        const insertPayload: Array<typeof socialLinks.$inferInsert> = links.map(
          (l, idx) => {
            const detected = detectPlatform(l.url);
            const normalizedUrl = detected.normalizedUrl;
            const evidence = {
              sources: l.evidence?.sources ?? [],
              signals: l.evidence?.signals ?? [],
            };
            const scored = computeLinkConfidence({
              sourceType: l.sourceType ?? 'manual',
              signals: evidence.signals,
              sources: [...evidence.sources, 'dashboard'],
              usernameNormalized: profile.usernameNormalized ?? null,
              url: normalizedUrl,
              existingConfidence:
                typeof l.confidence === 'number' ? l.confidence : null,
            });
            const state =
              l.state ??
              (l.isActive === false || l.state === 'suggested'
                ? 'suggested'
                : scored.state);
            const confidence =
              typeof l.confidence === 'number'
                ? Number(l.confidence.toFixed(2))
                : scored.confidence;

            return {
              creatorProfileId: profileId,
              platform: l.platform,
              platformType: detected.platform.category,
              url: normalizedUrl,
              sortOrder: l.sortOrder ?? idx,
              state,
              isActive: state === 'active',
              // Drizzle numeric columns use string representations; keep the
              // computed numeric value only in memory.
              confidence: confidence.toFixed(2),
              sourcePlatform: l.sourcePlatform,
              sourceType: l.sourceType ?? 'manual',
              evidence: {
                ...evidence,
                sources: Array.from(new Set(evidence.sources)),
                signals: Array.from(new Set(evidence.signals)),
              },
              displayText: l.displayText || null,
            };
          }
        );

        await db.insert(socialLinks).values(insertPayload);
      }

      const linktreeTargets = links.filter(
        link => link.platform === 'linktree' || isLinktreeUrl(link.url)
      );
      const beaconsTargets = links
        .map(link => {
          const validated = validateBeaconsUrl(link.url);
          if (!validated) return null;
          return link.platform === 'beacons' || isBeaconsUrl(validated)
            ? { ...link, url: validated }
            : null;
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));
      const layloTargets = links.filter(
        link => link.platform === 'laylo' || isLayloUrl(link.url)
      );
      const youtubeTargets = links
        .map(link => {
          const validated = validateYouTubeChannelUrl(link.url);
          return validated ? { ...link, url: validated } : null;
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));

      if (beaconsTargets.length > 0) {
        await Promise.all(
          beaconsTargets.map(link =>
            enqueueBeaconsIngestionJob({
              creatorProfileId: profileId,
              sourceUrl: link.url,
            }).catch(err => {
              console.error('Failed to enqueue beacons ingestion job', err);
              return null;
            })
          )
        );
      }

      if (linktreeTargets.length > 0) {
        await Promise.all(
          linktreeTargets.map(link =>
            enqueueLinktreeIngestionJob({
              creatorProfileId: profileId,
              sourceUrl: link.url,
            }).catch(err => {
              console.error('Failed to enqueue linktree ingestion job', err);
              return null;
            })
          )
        );
      }

      if (layloTargets.length > 0) {
        await Promise.all(
          layloTargets.map(link =>
            enqueueLayloIngestionJob({
              creatorProfileId: profileId,
              sourceUrl: link.url,
            }).catch(err => {
              console.error('Failed to enqueue laylo ingestion job', err);
              return null;
            })
          )
        );
      }

      if (youtubeTargets.length > 0) {
        await Promise.all(
          youtubeTargets.map(link =>
            enqueueYouTubeIngestionJob({
              creatorProfileId: profileId,
              sourceUrl: link.url,
            }).catch(err => {
              console.error('Failed to enqueue youtube ingestion job', err);
              return null;
            })
          )
        );
      }

      return NextResponse.json(
        { ok: true },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    console.error('Error updating social links:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    return await withDbSession(async clerkUserId => {
      const rawBody = await req.json().catch(() => null);
      if (rawBody == null || typeof rawBody !== 'object') {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const parsed = updateLinkStateSchema.safeParse(rawBody);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { profileId, linkId, action } = parsed.data;

      const [profile] = await db
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
        )
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const [link] = await db
        .select({
          id: socialLinks.id,
          creatorProfileId: socialLinks.creatorProfileId,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
        })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.id, linkId),
            eq(socialLinks.creatorProfileId, profile.id)
          )
        )
        .limit(1);

      if (!link) {
        return NextResponse.json(
          { error: 'Link not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const evidenceRaw =
        (link.evidence as { sources?: string[]; signals?: string[] }) || {};
      const nextEvidence = {
        sources: Array.from(
          new Set([...(evidenceRaw.sources ?? []), 'dashboard'])
        ),
        signals: Array.from(
          new Set(
            [
              ...(evidenceRaw.signals ?? []),
              action === 'accept' ? 'kept_after_claim' : undefined,
            ].filter(Boolean) as string[]
          )
        ),
      };

      const existingConfidence =
        typeof link.confidence === 'number'
          ? link.confidence
          : Number.parseFloat(String(link.confidence ?? '0'));

      const scored = computeLinkConfidence({
        sourceType: link.sourceType ?? 'manual',
        signals: nextEvidence.signals,
        sources: nextEvidence.sources,
        usernameNormalized: profile.usernameNormalized ?? null,
        url: link.url,
        existingConfidence,
      });

      const nextState = action === 'accept' ? 'active' : 'rejected';
      const nextConfidence =
        action === 'accept' ? Math.max(scored.confidence, 0.7) : 0;

      const [updated] = await db
        .update(socialLinks)
        .set({
          state: nextState,
          isActive: action === 'accept',
          // Persist confidence as a fixed-point string to match the numeric column type
          confidence: nextConfidence.toFixed(2),
          evidence: nextEvidence,
          updatedAt: new Date(),
        })
        .where(eq(socialLinks.id, link.id))
        .returning({
          id: socialLinks.id,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
        });

      return NextResponse.json(
        { ok: true, link: updated },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    console.error('Error updating social link state:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
