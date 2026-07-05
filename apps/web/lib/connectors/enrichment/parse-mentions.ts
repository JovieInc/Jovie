import type { ExtractedEntityMention } from './types';

export interface GmailObjectPayload {
  readonly subject?: string;
  readonly from?: string;
  readonly date?: string;
  readonly snippet?: string;
}

export interface CalendarObjectPayload {
  readonly summary?: string;
  readonly location?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

const BOOKING_SUBJECT_RE =
  /(?:—|-)\s*([^,]+?)(?:\s*,|\s+\w+\s+\d{1,2}\s+\d{4})/;
const VENUE_IN_SNIPPET_RE =
  /(?:at|@)\s+([A-Z][A-Za-z0-9'&\-\s]{2,60}?)(?:\s+on\b|,|\.|\s+\d)/;
const PERSON_FROM_RE = /^([^<@]+?)(?:\s*<|$)/;
const STUDIO_RE = /\b(studio|rehearsal|session)\b/i;

function uniqueMentions(
  mentions: readonly ExtractedEntityMention[]
): ExtractedEntityMention[] {
  const seen = new Set<string>();
  const result: ExtractedEntityMention[] = [];

  for (const mention of mentions) {
    const key = `${mention.type}:${mention.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(mention);
  }

  return result;
}

function parseSenderName(from: string): ExtractedEntityMention | null {
  const trimmed = from.trim();
  if (!trimmed) return null;

  const match = trimmed.match(PERSON_FROM_RE);
  const name = match?.[1]?.trim().replace(/^"|"$/g, '');
  if (!name || name.length < 2) return null;

  const isCompany =
    name.includes('@') ||
    /\.(com|org|net|de|uk)$/i.test(name) ||
    /\b(bookings?|info|noreply|artists?)\b/i.test(name);

  return {
    type: isCompany ? 'company' : 'person',
    name,
    confidence: isCompany ? 0.72 : 0.8,
    factKind: 'person_mentioned',
    metadata: { source: 'gmail_from' },
  };
}

function parseVenueFromSubject(subject: string): ExtractedEntityMention | null {
  const match = subject.match(BOOKING_SUBJECT_RE);
  const venue = match?.[1]?.trim();
  if (!venue || venue.length < 2) return null;

  const isStudio = STUDIO_RE.test(venue);
  return {
    type: isStudio ? 'studio' : 'location',
    name: venue,
    confidence: 0.78,
    factKind: isStudio ? 'studio_location' : 'location_mentioned',
    metadata: { source: 'gmail_subject' },
  };
}

function parseVenueFromSnippet(snippet: string): ExtractedEntityMention | null {
  const match = snippet.match(VENUE_IN_SNIPPET_RE);
  const venue = match?.[1]?.trim();
  if (!venue || venue.length < 2) return null;

  const isStudio = STUDIO_RE.test(venue);
  return {
    type: isStudio ? 'studio' : 'location',
    name: venue,
    confidence: 0.74,
    factKind: isStudio ? 'studio_location' : 'location_mentioned',
    metadata: { source: 'gmail_snippet' },
  };
}

export function extractGmailMentions(
  payload: GmailObjectPayload
): ExtractedEntityMention[] {
  const mentions: ExtractedEntityMention[] = [];

  if (payload.from) {
    const sender = parseSenderName(payload.from);
    if (sender) mentions.push(sender);
  }

  if (payload.subject) {
    const venue = parseVenueFromSubject(payload.subject);
    if (venue) mentions.push(venue);
  }

  if (payload.snippet) {
    const venue = parseVenueFromSnippet(payload.snippet);
    if (venue) mentions.push(venue);
  }

  return uniqueMentions(mentions);
}

export function extractCalendarMentions(
  payload: CalendarObjectPayload
): ExtractedEntityMention[] {
  const mentions: ExtractedEntityMention[] = [];

  if (payload.location?.trim()) {
    const location = payload.location.trim();
    const isStudio = STUDIO_RE.test(location);
    mentions.push({
      type: isStudio ? 'studio' : 'location',
      name: location,
      confidence: 0.86,
      factKind: isStudio ? 'studio_location' : 'location_mentioned',
      metadata: { source: 'calendar_location' },
    });
  }

  if (payload.summary?.trim()) {
    const summary = payload.summary.trim();
    if (STUDIO_RE.test(summary)) {
      mentions.push({
        type: 'event',
        name: summary,
        confidence: 0.7,
        factKind: 'location_mentioned',
        metadata: { source: 'calendar_summary' },
      });
    }
  }

  return uniqueMentions(mentions);
}
