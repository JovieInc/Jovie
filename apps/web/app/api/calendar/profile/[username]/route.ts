import { eq } from 'drizzle-orm';
import { after, type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { escapeIcsText, formatIcsTimestamp } from '@/lib/ics/format';
import { apiLimiter, createRateLimitHeaders } from '@/lib/rate-limit';
import { getConfirmedTourEventsForProfile } from '@/lib/tour-dates/queries';

/**
 * Per-artist ICS subscribe feed.
 *
 * Emits a `text/calendar` (.ics) feed of every confirmed tour-type event
 * for `username`. Industry subscribers (managers, agents, journalists)
 * plug this URL into their calendar app and stay in sync without asking
 * the artist for updates.
 *
 * Filters: `eventType='tour' AND confirmationStatus='confirmed'`. Pending,
 * rejected, and non-tour events MUST NOT leak to this feed — that is the
 * trust gate's whole point.
 *
 * The route is intentionally public (no auth) so external calendar
 * applications can subscribe without credentials. Privacy is enforced at
 * the profile level: private profiles return 404, matching the existing
 * `/[username]/tour` HTML surface.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username: rawUsername } = await params;
  const username = rawUsername?.toLowerCase().trim();

  if (!username || username.length === 0) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  // Per-IP rate limit. Calendar clients poll on the order of every 1-24
  // hours, so 100/min is generous; the limit exists to blunt obvious
  // scraping. Determined scrapers will still get every public tour date —
  // by design, this is parity with the existing `/[username]/tour` page.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const rateLimitResult = await apiLimiter.limit(`ics-profile:${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  }

  try {
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
        isPublic: creatorProfiles.isPublic,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, username))
      .limit(1);

    // Private profiles AND missing profiles return 404. Same surface a
    // scraper would see for either case → no profile-existence side
    // channel.
    if (!profile || !profile.isPublic) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const artistName = profile.displayName || profile.username;
    const events = await getConfirmedTourEventsForProfile(profile.id);

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//Jovie//Tour Dates · ${escapeIcsText(artistName)}//EN`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcsText(`${artistName} — tour`)}`,
      `X-WR-CALDESC:${escapeIcsText(`Confirmed tour dates for ${artistName} · jov.ie/${profile.username}`)}`,
    ];

    const stamp = formatIcsTimestamp(new Date());
    for (const event of events) {
      const startDate = new Date(event.startDate);
      if (Number.isNaN(startDate.getTime())) continue;
      const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

      const location = [
        event.venueName,
        event.city,
        event.region,
        event.country,
      ]
        .filter(Boolean)
        .join(', ');

      const summary = event.title
        ? `${artistName}: ${event.title}`
        : `${artistName} at ${event.venueName}`;

      const descriptionParts: string[] = [
        `${artistName} live at ${event.venueName}`,
      ];
      if (event.startTime) {
        descriptionParts.push(`Doors: ${event.startTime}`);
      }
      if (event.ticketUrl) {
        descriptionParts.push(`Tickets: ${event.ticketUrl}`);
      }
      const description = descriptionParts.join(String.raw`\n`);

      lines.push(
        'BEGIN:VEVENT',
        `UID:${event.id}@jov.ie`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${formatIcsTimestamp(startDate)}`,
        `DTEND:${formatIcsTimestamp(endDate)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        `LOCATION:${escapeIcsText(location)}`,
        ...(event.ticketUrl ? [`URL:${event.ticketUrl}`] : []),
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');

    const icsContent = lines.join('\r\n');
    const filename = `${profile.username}_tour.ics`.replaceAll(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600, must-revalidate',
      },
    });
  } catch (error) {
    after(() =>
      captureError('Per-artist ICS generation failed', error, {
        route: '/api/calendar/profile/[username]',
        username,
      })
    );
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
