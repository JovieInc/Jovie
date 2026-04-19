import type {
  AudienceEventInput,
  AudienceEventSentence,
  AudienceEventSentenceToken,
  AudienceEventType,
} from './activity-types';

const EVENT_ICONS: Record<AudienceEventType, string> = {
  profile_visited: 'Eye',
  source_scanned: 'QrCode',
  link_clicked: 'MousePointerClick',
  content_checked_out: 'ExternalLink',
  tour_date_checked_out: 'MapPin',
  date_saved: 'CalendarCheck',
  subscription_created: 'Bell',
  social_opened: 'ExternalLink',
  tip_link_opened: 'HandCoins',
  tip_sent: 'BadgeDollarSign',
  legacy: 'Sparkles',
};

const KNOWN_EVENT_TYPES = new Set<AudienceEventType>([
  'profile_visited',
  'source_scanned',
  'link_clicked',
  'content_checked_out',
  'tour_date_checked_out',
  'date_saved',
  'subscription_created',
  'social_opened',
  'tip_link_opened',
  'tip_sent',
  'legacy',
]);

function normalizeEventType(
  value: string | null | undefined
): AudienceEventType {
  return KNOWN_EVENT_TYPES.has(value as AudienceEventType)
    ? (value as AudienceEventType)
    : 'legacy';
}

function cleanLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function titleCase(value: string): string {
  return value
    .replaceAll(/[_-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function platformLabel(event: AudienceEventInput): string | null {
  const raw =
    cleanLabel(event.platform) ??
    cleanLabel(
      typeof event.properties?.platform === 'string'
        ? event.properties.platform
        : null
    ) ??
    cleanLabel(
      typeof event.properties?.provider === 'string'
        ? event.properties.provider
        : null
    );

  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === 'apple_music') return 'Apple Music';
  if (normalized === 'amazon_music') return 'Amazon Music';
  if (normalized === 'soundcloud') return 'SoundCloud';
  if (normalized === 'youtube') return 'YouTube';
  if (normalized === 'youtube_music') return 'YouTube Music';
  if (normalized === 'tiktok') return 'TikTok';
  if (normalized === 'instagram') return 'Instagram';
  if (normalized === 'spotify') return 'Spotify';
  return titleCase(raw);
}

function actorLabel(event: AudienceEventInput): string {
  const actor =
    cleanLabel(
      typeof event.properties?.actor === 'string'
        ? event.properties.actor
        : null
    ) ??
    cleanLabel(
      typeof event.context?.actor === 'string' ? event.context.actor : null
    );

  return actor ?? 'Someone';
}

function objectLabel(event: AudienceEventInput, fallback: string): string {
  return cleanLabel(event.objectLabel) ?? fallback;
}

function sourceLabel(event: AudienceEventInput): string {
  return cleanLabel(event.sourceLabel) ?? 'Source';
}

function token(
  kind: AudienceEventSentenceToken['kind'],
  label: string
): AudienceEventSentenceToken {
  return { kind, label };
}

function sentence(
  eventType: AudienceEventType,
  tokens: AudienceEventSentenceToken[]
): AudienceEventSentence {
  const text = tokens.map(part => part.label).join(' ');
  return {
    kind: 'sentence',
    icon: EVENT_ICONS[eventType],
    text,
    tokens,
  };
}

function legacySentence(event: AudienceEventInput): AudienceEventSentence {
  const legacyLabel = cleanLabel(event.label);
  if (!legacyLabel) return { kind: 'empty' };

  const normalized = legacyLabel
    .replaceAll(/\blistened\b/gi, 'checked out')
    .replaceAll(/\bwatched\b/gi, 'checked out')
    .replaceAll(/\bsent venmo tip\b/gi, 'opened tip link');

  return sentence('legacy', [token('verb', titleCase(normalized))]);
}

export function renderAudienceEventSentence(
  event: AudienceEventInput
): AudienceEventSentence {
  const eventType = normalizeEventType(event.eventType);
  const actor = actorLabel(event);
  const platform = platformLabel(event);

  switch (eventType) {
    case 'source_scanned':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Scanned'),
        token('source', sourceLabel(event)),
      ]);
    case 'profile_visited':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Visited'),
        token('object', 'Profile'),
      ]);
    case 'link_clicked':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Clicked'),
        token('object', objectLabel(event, 'Link')),
      ]);
    case 'content_checked_out': {
      const baseTokens = [
        token('actor', actor),
        token('verb', 'Checked Out'),
        token('object', objectLabel(event, 'Content')),
      ];

      return sentence(
        eventType,
        platform
          ? [...baseTokens, token('verb', 'On'), token('platform', platform)]
          : baseTokens
      );
    }
    case 'tour_date_checked_out':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Checked Out'),
        token('object', objectLabel(event, 'Tour Date')),
      ]);
    case 'date_saved':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Saved Date For'),
        token('object', objectLabel(event, 'Tour Date')),
      ]);
    case 'subscription_created':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Subscribed'),
      ]);
    case 'social_opened':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Opened'),
        token('platform', platform ?? objectLabel(event, 'Social Link')),
      ]);
    case 'tip_link_opened':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Opened'),
        token('object', 'Tip Link'),
      ]);
    case 'tip_sent':
      return sentence(eventType, [
        token('actor', actor),
        token('verb', 'Sent A Tip'),
      ]);
    case 'legacy':
      return legacySentence(event);
    default:
      return legacySentence(event);
  }
}

export function getAudienceEventSentenceText(
  event: AudienceEventInput
): string | null {
  const rendered = renderAudienceEventSentence(event);
  return rendered.kind === 'sentence' ? rendered.text : null;
}
