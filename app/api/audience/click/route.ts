import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audienceMembers, clickEvents, creatorProfiles } from '@/lib/db/schema';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  createFingerprint,
  deriveIntentLevel,
  getActionWeight,
  trimHistory,
} from '../lib/audience-utils';

export const runtime = 'nodejs';

const clickSchema = z.object({
  profileId: z.string().uuid(),
  linkId: z.string().uuid().optional(),
  linkType: z.enum(['listen', 'social', 'tip', 'other']).default('other'),
  actionLabel: z.string().optional(),
  platform: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  referrer: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  deviceType: z.enum(['mobile', 'desktop', 'tablet', 'unknown']).optional(),
  os: z.string().optional(),
  browser: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  audienceMemberId: z.string().uuid().optional(),
});

const ACTION_ICONS: Record<string, string> = {
  listen: '🎧',
  social: '📸',
  tip: '💸',
  other: '🔗',
};

const ACTION_LABELS: Record<string, string> = {
  listen: 'listened',
  social: 'tapped a social link',
  tip: 'sent a tip',
  other: 'clicked a link',
};

type AudienceMemberRecord = {
  id: string;
  visits: number | null;
  engagementScore: number | null;
  latestActions: Record<string, unknown>[] | null;
  geoCity: string | null;
  geoCountry: string | null;
  deviceType: string | null;
  spotifyConnected: boolean | null;
};

async function findAudienceMember(
  tx: typeof db,
  profileId: string,
  fingerprint: string,
  explicitId?: string
): Promise<AudienceMemberRecord | null> {
  if (explicitId) {
    const [result] = await tx
      .select({
        id: audienceMembers.id,
        visits: audienceMembers.visits,
        engagementScore: audienceMembers.engagementScore,
        latestActions: audienceMembers.latestActions,
        geoCity: audienceMembers.geoCity,
        geoCountry: audienceMembers.geoCountry,
        deviceType: audienceMembers.deviceType,
        spotifyConnected: audienceMembers.spotifyConnected,
      })
      .from(audienceMembers)
      .where(eq(audienceMembers.id, explicitId))
      .limit(1);

    if (result) {
      return result;
    }
  }

  const [member] = await tx
    .select({
      id: audienceMembers.id,
      visits: audienceMembers.visits,
      engagementScore: audienceMembers.engagementScore,
      latestActions: audienceMembers.latestActions,
      geoCity: audienceMembers.geoCity,
      geoCountry: audienceMembers.geoCountry,
      deviceType: audienceMembers.deviceType,
      spotifyConnected: audienceMembers.spotifyConnected,
    })
    .from(audienceMembers)
    .where(
      and(
        eq(audienceMembers.creatorProfileId, profileId),
        eq(audienceMembers.fingerprint, fingerprint)
      )
    )
    .limit(1);

  return member ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = clickSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid click payload' },
        { status: 400 }
      );
    }

    const {
      profileId,
      linkId,
      linkType,
      actionLabel,
      platform,
      ipAddress,
      userAgent,
      referrer,
      city,
      country,
      deviceType,
      os,
      browser,
      metadata,
      audienceMemberId,
    } = parsed.data;

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

    const fingerprint = createFingerprint(ipAddress, userAgent);
    const normalizedDevice = deviceType ?? 'unknown';
    const now = new Date();

    await withSystemIngestionSession(async tx => {
      let member = await findAudienceMember(
        tx,
        profileId,
        fingerprint,
        audienceMemberId
      );

      if (!member) {
        const [inserted] = await tx
          .insert(audienceMembers)
          .values({
            creatorProfileId: profileId,
            fingerprint,
            type: 'anonymous',
            displayName: 'Visitor',
            firstSeenAt: now,
            lastSeenAt: now,
            visits: 0,
            engagementScore: 0,
            intentLevel: 'low',
            deviceType: normalizedDevice,
            referrerHistory: [],
            latestActions: [],
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({
            target: [
              audienceMembers.creatorProfileId,
              audienceMembers.fingerprint,
            ],
          })
          .returning({
            id: audienceMembers.id,
            visits: audienceMembers.visits,
            engagementScore: audienceMembers.engagementScore,
            latestActions: audienceMembers.latestActions,
            geoCity: audienceMembers.geoCity,
            geoCountry: audienceMembers.geoCountry,
            deviceType: audienceMembers.deviceType,
            spotifyConnected: audienceMembers.spotifyConnected,
          });

        if (inserted) {
          member = inserted;
        } else {
          // Another transaction inserted the row first; load the existing record.
          member = await findAudienceMember(tx, profileId, fingerprint);
        }
      }

      if (!member) {
        throw new Error('Unable to resolve audience member');
      }

      const existingActions = Array.isArray(member.latestActions)
        ? member.latestActions
        : [];
      const actionEntry = {
        label: actionLabel ?? ACTION_LABELS[linkType] ?? 'interacted',
        type: linkType,
        platform: platform ?? linkType,
        emoji: ACTION_ICONS[linkType] ?? '⭐',
        timestamp: now.toISOString(),
      };
      const latestActions = trimHistory([actionEntry, ...existingActions], 5);
      const actionCount = latestActions.length;
      const weight = getActionWeight(linkType);
      const updatedScore = (member.engagementScore ?? 0) + weight;
      const intentLevel = deriveIntentLevel(member.visits ?? 0, actionCount);

      await tx.insert(clickEvents).values({
        creatorProfileId: profileId,
        linkId,
        linkType,
        ipAddress,
        userAgent,
        referrer,
        country,
        city,
        deviceType: normalizedDevice,
        os,
        browser,
        metadata: metadata ?? {},
        audienceMemberId: member.id,
      });

      await tx
        .update(audienceMembers)
        .set({
          lastSeenAt: now,
          updatedAt: now,
          engagementScore: updatedScore,
          intentLevel,
          latestActions,
          deviceType: normalizedDevice,
          geoCity: city ?? member.geoCity ?? null,
          geoCountry: country ?? member.geoCountry ?? null,
          spotifyConnected:
            (member.spotifyConnected ?? false) || linkType === 'listen',
        })
        .where(eq(audienceMembers.id, member.id));
    });

    return NextResponse.json({ success: true, fingerprint });
  } catch (error) {
    console.error('[Audience Click] Error', error);
    return NextResponse.json(
      { error: 'Unable to record click' },
      { status: 500 }
    );
  }
}
