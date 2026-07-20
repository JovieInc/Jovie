import { getMerchPriceDisplay } from '@/lib/merch/pricing';
import type { PublicMerchCard } from '@/lib/merch/types';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { formatLocationString } from '@/lib/utils/string-utils';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { KIND_PRESETS } from './kind-presets';
import type {
  EntityAccent,
  EntityCardModel,
  EntityCardStatus,
  EntityStatusTone,
} from './types';

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function merchStatus(
  status: PublicMerchCard['status']
): EntityCardStatus | null {
  switch (status) {
    case 'live':
      return { label: 'Live', tone: 'live' };
    case 'draft':
      return { label: 'Draft', tone: 'draft' };
    case 'paused':
      return { label: 'Paused', tone: 'neutral' };
    default:
      return null;
  }
}

/** Public profile / chat merch card → unified model. */
export function merchToEntityCard(
  card: PublicMerchCard,
  options: Readonly<{ handle: string }>
): EntityCardModel {
  const preset = KIND_PRESETS.merch;
  const price = getMerchPriceDisplay(
    card.retailPriceCents,
    null,
    card.pricing.artistPayoutPerUnitEstimateCents
  );
  const href = `/${options.handle}/merch/${card.id}`;

  return {
    id: card.id,
    kind: 'merch',
    href,
    imageUrl: card.primaryImageUrl || card.mockupUrls[0] || null,
    imageAlt: card.title,
    accent: preset.accent,
    eyebrow: preset.eyebrow,
    title: card.title,
    meta: card.productType,
    status: merchStatus(card.status),
    price: {
      display: price.displayPrice,
      original: price.isOnSale ? price.originalPrice : undefined,
      profit: price.creatorProfit,
    },
    cta: { label: preset.ctaLabel, href },
  };
}

export interface ReleaseEntityInput {
  readonly id?: string;
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl?: string | null;
  readonly releaseDate?: Date | string | null;
  /** e.g. "single" | "album" | "ep" | "video". */
  readonly releaseType?: string | null;
}

function formatReleaseType(type: string | null | undefined): string | null {
  if (!type) {
    return null;
  }
  if (type === 'ep') {
    return 'EP';
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Music release → unified model. `kind: 'video'` reuses the same shape. */
export function releaseToEntityCard(
  release: ReleaseEntityInput,
  options: Readonly<{ handle: string; kind?: 'music' | 'video'; now?: Date }>
): EntityCardModel {
  const kind = options.kind ?? 'music';
  const preset = KIND_PRESETS[kind];
  const date = toDate(release.releaseDate);
  const now = options.now ?? new Date();
  const isFuture = date !== null && date.getTime() > now.getTime();
  const year = date ? date.getUTCFullYear() : null;
  const typeLabel = formatReleaseType(release.releaseType);
  const meta = [typeLabel, year ? String(year) : null]
    .filter(Boolean)
    .join(' · ');
  const href = `/${options.handle}/${release.slug}`;

  return {
    id: release.slug,
    releaseId: release.id,
    kind,
    href,
    imageUrl: release.artworkUrl ?? null,
    imageAlt: `${release.title} artwork`,
    accent: preset.accent,
    eyebrow: isFuture ? 'Coming Soon' : preset.eyebrow,
    title: release.title,
    meta: meta || null,
    status: isFuture
      ? { label: 'Scheduled', tone: 'scheduled' }
      : { label: 'Out Now', tone: 'live' },
    cta: {
      label: isFuture ? 'Notify Me' : preset.ctaLabel,
      href: isFuture ? null : href,
    },
  };
}

export interface ShowEntityInput {
  readonly id: string;
  readonly title?: string | null;
  readonly venueName?: string | null;
  readonly city?: string | null;
  readonly startDate?: Date | string | null;
  readonly ticketUrl?: string | null;
  readonly status?: EntityStatusTone | null;
}

export interface ChatReleaseContextInput {
  readonly id: string;
  readonly title: string;
  readonly artworkUrl?: string | null;
  readonly releaseType?: string | null;
}

/** Chat rail release context chip → compact EntityCard (no navigation). */
export function chatReleaseContextToEntityCard(
  release: ChatReleaseContextInput | null,
  options: Readonly<{
    fallbackTitle: string;
    fallbackType?: string | null;
    loading?: boolean;
  }>
): EntityCardModel {
  const preset = KIND_PRESETS.music;
  const title = release?.title?.trim() || options.fallbackTitle;
  const typeLabel = formatReleaseType(
    release?.releaseType ?? options.fallbackType
  );
  const meta = options.loading
    ? 'Loading Release'
    : typeLabel
      ? `${typeLabel} Context`
      : 'Release Context';

  return {
    id: release?.id ?? 'release-context',
    kind: 'music',
    imageUrl: release?.artworkUrl ?? null,
    imageAlt: title,
    accent: preset.accent,
    eyebrow: preset.eyebrow,
    title,
    meta,
  };
}

export interface ChatTourDateContextInput {
  readonly id: string;
  readonly title?: string | null;
  readonly venueName?: string | null;
  readonly city?: string | null;
  readonly startDate?: Date | string | null;
}

/** Chat rail tour-date context chip → compact EntityCard (no navigation). */
export function chatTourDateContextToEntityCard(
  event: ChatTourDateContextInput | null,
  options: Readonly<{
    fallbackTitle: string;
    loading?: boolean;
  }>
): EntityCardModel {
  if (options.loading) {
    return {
      id: event?.id ?? 'tour-date-context',
      kind: 'show',
      imageUrl: null,
      imageAlt: options.fallbackTitle,
      title: options.fallbackTitle,
      meta: 'Loading Tour Date',
    };
  }

  const model = showToEntityCard({
    id: event?.id ?? 'tour-date-context',
    title: event?.title,
    venueName: event?.venueName,
    city: event?.city,
    startDate: event?.startDate,
  });

  return {
    ...model,
    href: null,
    cta: null,
    meta: 'Tour Date Context',
  };
}

// Show dates render in UTC everywhere on the profile (card date pills AND the
// events list) so the two never disagree — local-time formatting split them
// for evening shows (e.g. "JUL 28" on the card vs "Jul 29" in the list).
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  timeZone: 'UTC',
});

function getTourEyebrow(
  isNearYou: boolean,
  distanceKm: number | null | undefined
): string {
  if (!isNearYou) {
    return 'Next Show';
  }

  return distanceKm === null || distanceKm === undefined
    ? 'Near You'
    : `${Math.round(distanceKm)} km away`;
}

function getTimezoneAbbrev(
  date: Date,
  timezone: string | null | undefined
): string | null {
  if (!timezone) {
    return null;
  }

  try {
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
      })
        .formatToParts(date)
        .find(part => part.type === 'timeZoneName')?.value ?? null
    );
  } catch {
    return null;
  }
}

export interface TourDateEntityOptions {
  readonly isNearYou?: boolean;
  readonly distanceKm?: number | null;
}

/**
 * Tour page card → unified model. Call-site wires `cta` / `secondaryCta`
 * onClick handlers for analytics and calendar fallback.
 */
export function tourDateToEntityCard(
  tourDate: TourDateViewModel,
  options: TourDateEntityOptions = {}
): EntityCardModel {
  const date = toDate(tourDate.startDate);
  const location = formatLocationString([
    tourDate.city,
    tourDate.region,
    tourDate.country,
  ]);
  const isSoldOut = tourDate.ticketStatus === 'sold_out';
  const isCancelled = tourDate.ticketStatus === 'cancelled';
  const canBuyTickets =
    Boolean(tourDate.ticketUrl) && !isCancelled && !isSoldOut;
  const timezoneAbbr = date ? getTimezoneAbbrev(date, tourDate.timezone) : null;
  const doorsMeta = tourDate.startTime
    ? `Doors: ${tourDate.startTime}${timezoneAbbr ? ` ${timezoneAbbr}` : ''}`
    : null;
  const accent: EntityAccent = options.isNearYou ? 'blue' : 'orange';

  let primaryLabel = 'Add To Calendar';
  if (isCancelled) {
    primaryLabel = 'Cancelled';
  } else if (canBuyTickets) {
    primaryLabel = 'Get Tickets';
  }

  return {
    id: tourDate.id,
    kind: 'show',
    imageUrl: null,
    imageAlt: tourDate.venueName,
    accent,
    eyebrow: getTourEyebrow(options.isNearYou ?? false, options.distanceKm),
    title: tourDate.title ?? 'Live',
    meta: [tourDate.venueName, location].filter(Boolean).join(' · ') || null,
    secondaryMeta: doorsMeta,
    datePill: date
      ? {
          month: monthFormatter.format(date),
          day: dayFormatter.format(date),
        }
      : null,
    status: isSoldOut ? { label: 'Sold Out', tone: 'scheduled' } : null,
    interactive: true,
    cta: {
      label: primaryLabel,
      href: canBuyTickets ? tourDate.ticketUrl : null,
      external: canBuyTickets,
      disabled: isCancelled,
    },
    secondaryCta:
      canBuyTickets && !isCancelled
        ? { label: 'Add To Calendar', href: null }
        : null,
  };
}

/** AI crawler analytics summary → dashboard entity card model. */
export function aiCrawlerAnalyticsToEntityCard(
  analytics: Pick<
    AiCrawlerAnalyticsResponse,
    'totalRequests' | 'weeklyRequests' | 'crawlers' | 'isTeaser'
  >,
  options: Readonly<{ onOpenDetail?: () => void }> = {}
): EntityCardModel {
  const preset = KIND_PRESETS.ai;
  const topCrawler = analytics.crawlers[0]?.name;
  const detail =
    analytics.totalRequests > 0
      ? analytics.crawlers.length > 1
        ? `${analytics.crawlers.length} services tracked`
        : (topCrawler ?? 'Last 30 days')
      : 'Waiting for first AI crawl';

  return {
    id: 'ai-crawler-intelligence',
    kind: 'ai',
    accent: preset.accent,
    eyebrow: preset.eyebrow,
    title: `${analytics.totalRequests.toLocaleString()} reads`,
    meta: detail,
    secondaryMeta:
      analytics.weeklyRequests > 0
        ? `${analytics.weeklyRequests.toLocaleString()} this week`
        : 'Last 30 days',
    status:
      analytics.totalRequests > 0
        ? { label: 'Active', tone: 'live' }
        : { label: 'Collecting', tone: 'neutral' },
    cta: analytics.isTeaser
      ? { label: 'Upgrade To Pro', href: null, disabled: true }
      : {
          label: preset.ctaLabel,
          href: null,
          onClick: options.onOpenDetail
            ? () => options.onOpenDetail?.()
            : undefined,
        },
    interactive: true,
    imageAlt: 'AI crawler analytics',
  };
}

/** Tour date / event → unified model with a date pill. */
export function showToEntityCard(show: ShowEntityInput): EntityCardModel {
  const preset = KIND_PRESETS.show;
  const date = toDate(show.startDate);
  const title = show.title?.trim() || show.venueName?.trim() || 'Show';
  const location = [show.venueName, show.city].filter(Boolean).join(' · ');

  return {
    id: show.id,
    kind: 'show',
    href: show.ticketUrl ?? null,
    imageUrl: null,
    imageAlt: title,
    accent: preset.accent,
    eyebrow: preset.eyebrow,
    title,
    meta: location || null,
    datePill: date
      ? { month: monthFormatter.format(date), day: dayFormatter.format(date) }
      : null,
    status: null,
    cta: show.ticketUrl
      ? { label: preset.ctaLabel, href: show.ticketUrl, external: true }
      : // No ticket URL: keep the bottom slot honest — a target-less CTA the
        // card renders as plain muted text, never as button chrome.
        { label: 'No Tickets', href: null, disabled: true },
  };
}
