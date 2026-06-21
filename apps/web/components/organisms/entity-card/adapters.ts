import { getMerchPriceDisplay } from '@/lib/merch/pricing';
import type { PublicMerchCard } from '@/lib/merch/types';
import { KIND_PRESETS } from './kind-presets';
import type {
  EntityCardModel,
  EntityCardStatus,
  EntityStatusTone,
} from './types';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

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
      ? { month: MONTHS[date.getMonth()], day: String(date.getDate()) }
      : null,
    status: null,
    cta: show.ticketUrl
      ? { label: preset.ctaLabel, href: show.ticketUrl, external: true }
      : null,
  };
}
