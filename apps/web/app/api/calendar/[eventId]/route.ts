import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles, tourDates } from '@/lib/db/schema';

/**
 * Generate ICS calendar file for a tour date
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  // Fetch tour date with profile info
  const [result] = await db
    .select({
      tourDate: tourDates,
      profile: {
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
      },
    })
    .from(tourDates)
    .innerJoin(creatorProfiles, eq(tourDates.profileId, creatorProfiles.id))
    .where(eq(tourDates.id, eventId))
    .limit(1);

  if (!result) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const { tourDate, profile } = result;
  const artistName = profile.displayName || profile.username;

  // Format date for ICS (YYYYMMDD format)
  const startDate = new Date(tourDate.startDate);
  const formatIcsDate = (date: Date) => {
    return (
      date.toISOString().replaceAll('-', '').replaceAll(':', '').split('.')[0] +
      'Z'
    );
  };

  // Create end date (assume 3 hours if no end time specified)
  const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

  // Build location string
  const location = [
    tourDate.venueName,
    tourDate.city,
    tourDate.region,
    tourDate.country,
  ]
    .filter(Boolean)
    .join(', ');

  // Build description
  const descriptionParts = [`${artistName} live at ${tourDate.venueName}`];
  if (tourDate.startTime) {
    descriptionParts.push(`Doors: ${tourDate.startTime}`);
  }
  if (tourDate.ticketUrl) {
    descriptionParts.push(`Tickets: ${tourDate.ticketUrl}`);
  }
  const description = descriptionParts.join(String.raw`\n`);

  // Build event summary
  const summary = tourDate.title
    ? `${artistName}: ${tourDate.title}`
    : `${artistName} at ${tourDate.venueName}`;

  // Generate unique ID for the event
  const uid = `${tourDate.id}@jov.ie`;

  // Build ICS content
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jovie//Tour Dates//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    tourDate.ticketUrl ? `URL:${tourDate.ticketUrl}` : null,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  // Generate filename with null-safe handling
  const citySlug = (tourDate.city || 'event').replaceAll(/[^a-zA-Z0-9]/g, '_');
  const artistSlug = (artistName ?? 'artist').replaceAll(/[^a-zA-Z0-9]/g, '_');
  const filename = `${artistSlug}_${citySlug}.ics`;

  return new NextResponse(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Escape special characters for ICS format per RFC 5545
 */
function escapeIcsText(text: string): string {
  if (!text) return '';
  return text
    .replaceAll('\\', String.raw`\\`)
    .replaceAll(';', String.raw`\;`)
    .replaceAll(',', String.raw`\,`)
    .replaceAll('\r', '')
    .replaceAll('\n', String.raw`\n`);
}
