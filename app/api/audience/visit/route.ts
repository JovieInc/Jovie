import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audienceMembers, creatorProfiles } from '@/lib/db/schema';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import {
  createFingerprint,
  deriveIntentLevel,
  trimHistory,
} from '../lib/audience-utils';

export const runtime = 'nodejs';

const visitSchema = z.object({
  profileId: z.string().uuid(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  referrer: z.string().optional(),
  geoCity: z.string().optional(),
  geoCountry: z.string().optional(),
  deviceType: z.enum(['mobile', 'desktop', 'tablet', 'unknown']).optional(),
});

function inferDeviceType(
  userAgent: string | null
): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (ua.includes('mobi') || ua.includes('iphone') || ua.includes('android')) {
    return 'mobile';
  }
  return 'desktop';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = visitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid visit payload' },
        { status: 400 }
      );
    }

    const {
      profileId,
      ipAddress,
      userAgent,
      referrer,
      geoCity,
      geoCountry,
      deviceType,
    } = parsed.data;

    const resolvedUserAgent =
      userAgent ?? request.headers.get('user-agent') ?? undefined;
    const resolvedIpAddress =
      ipAddress ?? extractClientIP(request.headers) ?? undefined;
    const resolvedReferrer =
      referrer ?? request.headers.get('referer') ?? undefined;
    const resolvedGeoCity =
      geoCity ?? request.headers.get('x-vercel-ip-city') ?? undefined;
    const resolvedGeoCountry =
      geoCountry ??
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry') ??
      undefined;

    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404 }
      );
    }

    const fingerprint = createFingerprint(resolvedIpAddress, resolvedUserAgent);
    const normalizedDevice =
      deviceType ?? inferDeviceType(resolvedUserAgent ?? null);
    const now = new Date();
    const referrerEntry = resolvedReferrer
      ? [{ url: resolvedReferrer.trim(), timestamp: now.toISOString() }]
      : [];

    await withSystemIngestionSession(async tx => {
      const [existing] = await tx
        .select({
          id: audienceMembers.id,
          visits: audienceMembers.visits,
          latestActions: audienceMembers.latestActions,
          referrerHistory: audienceMembers.referrerHistory,
          engagementScore: audienceMembers.engagementScore,
          geoCity: audienceMembers.geoCity,
          geoCountry: audienceMembers.geoCountry,
          deviceType: audienceMembers.deviceType,
        })
        .from(audienceMembers)
        .where(
          and(
            eq(audienceMembers.creatorProfileId, profileId),
            eq(audienceMembers.fingerprint, fingerprint)
          )
        )
        .limit(1);

      const updatedVisits = (existing?.visits ?? 0) + 1;
      const actionCount = Array.isArray(existing?.latestActions)
        ? existing.latestActions.length
        : 0;
      const updatedIntent = deriveIntentLevel(updatedVisits, actionCount);
      const updatedScore = (existing?.engagementScore ?? 0) + 1;
      const previousReferrers = Array.isArray(existing?.referrerHistory)
        ? existing.referrerHistory
        : [];
      const referrerHistory = trimHistory(
        [...referrerEntry, ...previousReferrers],
        3
      );
      const geoCityValue = resolvedGeoCity ?? existing?.geoCity ?? null;
      const geoCountryValue =
        resolvedGeoCountry ?? existing?.geoCountry ?? null;

      if (existing) {
        await tx
          .update(audienceMembers)
          .set({
            visits: updatedVisits,
            lastSeenAt: now,
            updatedAt: now,
            engagementScore: updatedScore,
            intentLevel: updatedIntent,
            geoCity: geoCityValue,
            geoCountry: geoCountryValue,
            deviceType: normalizedDevice,
            referrerHistory,
          })
          .where(eq(audienceMembers.id, existing.id));
        return;
      }

      await tx.insert(audienceMembers).values({
        creatorProfileId: profileId,
        fingerprint,
        type: 'anonymous',
        displayName: 'Visitor',
        firstSeenAt: now,
        lastSeenAt: now,
        visits: 1,
        engagementScore: 1,
        intentLevel: 'low',
        geoCity: geoCityValue,
        geoCountry: geoCountryValue,
        deviceType: normalizedDevice,
        referrerHistory,
        tags: [],
        latestActions: [],
        updatedAt: now,
        createdAt: now,
      });
    });

    return NextResponse.json({ success: true, fingerprint });
  } catch (error) {
    console.error('[Audience Visit] Error', error);
    return NextResponse.json(
      { error: 'Unable to record visit' },
      { status: 500 }
    );
  }
}
