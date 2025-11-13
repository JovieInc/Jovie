import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clickEvents, creatorProfiles, socialLinks } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { detectPlatformFromUA } from '@/lib/utils';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { LinkType } from '@/types/db';

// API routes should be dynamic
export const dynamic = 'force-dynamic';

/**
 * Rate Limiting Status: NOT IMPLEMENTED
 * Following YC principle: "do things that don't scale until you have to"
 * Will add rate limiting when:
 * - Track events exceed ~50k/day
 * - Abuse/spam becomes measurable problem
 *
 * For now: basic input validation prevents most abuse
 */

// Valid link types enum for validation
const VALID_LINK_TYPES = ['listen', 'social', 'tip', 'other'] as const;

// Username validation regex (alphanumeric, underscore, hyphen, 3-30 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * Validate if a string is a valid URL
 */
function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      handle,
      linkType,
      target,
      linkId,
    }: {
      handle: string;
      linkType: LinkType;
      target: string;
      linkId?: string;
    } = body;

    // Validate required fields
    if (!handle || !linkType || !target) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: handle, linkType, and target are required',
        },
        { status: 400 }
      );
    }

    // Validate handle format
    if (!USERNAME_REGEX.test(handle)) {
      return NextResponse.json(
        {
          error:
            'Invalid handle format. Must be 3-30 alphanumeric characters, underscores, or hyphens',
        },
        { status: 400 }
      );
    }

    // Validate linkType is a valid enum value
    if (
      !VALID_LINK_TYPES.includes(linkType as (typeof VALID_LINK_TYPES)[number])
    ) {
      return NextResponse.json(
        {
          error: `Invalid linkType. Must be one of: ${VALID_LINK_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate target is a valid URL
    if (!isValidURL(target)) {
      return NextResponse.json(
        { error: 'Invalid target URL format' },
        { status: 400 }
      );
    }

    const userAgent = request.headers.get('user-agent');
    const platformDetected = detectPlatformFromUA(userAgent || undefined);
    const ipAddress = extractClientIP(request.headers);

    // Find the creator profile
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, handle.toLowerCase()))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Record the click event
    const [clickEvent] = await db
      .insert(clickEvents)
      .values({
        creatorProfileId: profile.id,
        linkType: linkType as 'listen' | 'social' | 'tip' | 'other', // Cast to enum type
        linkId: linkId || null,
        ipAddress: ipAddress,
        userAgent: userAgent,
        deviceType: platformDetected,
        metadata: { target },
      })
      .returning({ id: clickEvents.id });

    if (!clickEvent) {
      await captureError(
        'Failed to insert click event',
        new Error('Database insert returned no data'),
        {
          handle,
          linkType,
          creatorProfileId: profile.id,
        }
      );
      return NextResponse.json(
        { error: 'Failed to log click event' },
        { status: 500 }
      );
    }

    // Increment social link click count if applicable
    if (linkType === 'social' && linkId) {
      await db
        .update(socialLinks)
        .set({
          clicks: drizzleSql`${socialLinks.clicks} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(socialLinks.id, linkId));
    }

    return NextResponse.json({ success: true, id: clickEvent.id });
  } catch (error) {
    await captureError('Track API error', error, {
      route: '/api/track',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
