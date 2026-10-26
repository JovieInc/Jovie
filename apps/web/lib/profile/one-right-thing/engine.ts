/**
 * One right thing: the deterministic engine that picks the single item a
 * public profile features for the visitor in front of it.
 *
 * Pure module: no React, no DOM, no network, no storage. Callers resolve
 * {@link VisitorSignals} (see `visitor-signals.ts`) and the profile's
 * {@link FeaturedInventory}; the engine returns one {@link FeaturedDecision}
 * carrying a {@link FeaturedReasonCode} for analytics and the artist
 * dashboard ("shown the new song because they came from Spotify").
 *
 * Honesty contract (see `ONE_RIGHT_THING_CLAIM_GATE`):
 * - Rules are explicit and ordered. No ML, no scoring, no hidden state.
 * - Only signals available without non-essential cookies are used.
 *   "Returning visitor" is only ever `true` when consent allowed storing a
 *   marker; otherwise it is `null` and no rule treats unknown as false.
 * - `inApp` and `device` are recorded on the decision for measurement but no
 *   rule reads them yet. Do not describe them as inputs to the choice.
 */

export type FeaturedItemKind = 'release' | 'show' | 'merch' | 'tip' | 'listen';

export type VisitorChannel = 'dsp' | 'social' | 'search' | 'direct' | 'other';

export interface VisitorSource {
  readonly channel: VisitorChannel;
  /** Lowercase platform name when known, e.g. `spotify`, `instagram`. */
  readonly name: string | null;
}

export type InAppBrowser =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'spotify'
  | 'other';

export type VisitorDevice = 'ios' | 'android' | 'desktop' | 'unknown';

export interface VisitorSignals {
  readonly source: VisitorSource;
  readonly inApp: InAppBrowser | null;
  /** ISO 3166-1 alpha-2 from the edge geo cookie, or null when unknown. */
  readonly country: string | null;
  readonly device: VisitorDevice;
  /**
   * `true` only when consent allowed a stored marker and one was found.
   * `null` means unknown (no consent): never treated as a first visit.
   */
  readonly returning: boolean | null;
  readonly now: Date;
}

export interface FeaturedRelease {
  readonly slug: string;
  readonly releaseDate: Date | string | null;
  /** True while the release date is in the future (countdown phase). */
  readonly isUpcoming: boolean;
}

export interface FeaturedShow {
  readonly id: string;
  readonly startDate: Date | string;
  /** ISO code or English country name, as stored on the tour date. */
  readonly country: string;
  readonly ticketUrl: string | null;
}

export interface FeaturedInventory {
  readonly release: FeaturedRelease | null;
  readonly shows: readonly FeaturedShow[];
  readonly hasMerch: boolean;
  readonly hasTip: boolean;
  readonly hasListen: boolean;
}

export interface FeaturedInput {
  readonly signals: VisitorSignals;
  readonly inventory: FeaturedInventory;
  /** The artist's own pick. Wins whenever it is actually available. */
  readonly artistPriority?: FeaturedItemKind | null;
}

/**
 * Every reason a featured item can carry. `label` is the sentence the artist
 * dashboard shows. `personalizes` marks rules whose choice differs by visitor
 * signal or by the live timing of the artist's inventory; the claim gate
 * counts those.
 */
export const FEATURED_REASONS = {
  artist_pinned: {
    label: 'Shown because you pinned it',
    personalizes: false,
  },
  release_upcoming_countdown: {
    label: 'Shown the upcoming release because it is counting down',
    personalizes: false,
  },
  show_in_visitor_country_soon: {
    label: 'Shown your next show because it is soon and in their country',
    personalizes: true,
  },
  came_from_dsp_release: {
    label: 'Shown your music because they came from a streaming service',
    personalizes: true,
  },
  fresh_release: {
    label: 'Shown the new release because it is under 30 days old',
    personalizes: true,
  },
  returning_visitor_show: {
    label: 'Shown your next show because they have visited before',
    personalizes: true,
  },
  show_in_visitor_country: {
    label: 'Shown your next show because it is in their country',
    personalizes: true,
  },
  stale_release_show_soon: {
    label:
      'Shown your next show because your latest release is over 90 days old',
    personalizes: true,
  },
  default_release: { label: 'Shown your latest release', personalizes: false },
  default_show: { label: 'Shown your next show', personalizes: false },
  default_merch: { label: 'Shown your merch', personalizes: false },
  default_tip: { label: 'Shown your tip jar', personalizes: false },
  default_listen: { label: 'Shown your listening links', personalizes: false },
} as const satisfies Record<
  string,
  { readonly label: string; readonly personalizes: boolean }
>;

export type FeaturedReasonCode = keyof typeof FEATURED_REASONS;

export const FEATURED_REASON_CODES = Object.keys(
  FEATURED_REASONS
) as FeaturedReasonCode[];

export interface FeaturedDecision {
  readonly kind: FeaturedItemKind;
  /** Id of the chosen show or slug of the chosen release, when applicable. */
  readonly refId: string | null;
  readonly reason: FeaturedReasonCode;
  /** Segment dimensions recorded with every impression and tap. */
  readonly context: {
    readonly channel: VisitorChannel;
    readonly source: string | null;
    readonly inApp: InAppBrowser | null;
    readonly device: VisitorDevice;
    readonly country: string | null;
    readonly returning: boolean | null;
  };
}

const DAY_MS = 86_400_000;
export const SHOW_SOON_DAYS = 14;
export const SHOW_NEAR_DAYS = 60;
export const FRESH_RELEASE_DAYS = 30;
export const STALE_RELEASE_DAYS = 90;

/**
 * The claim gate. Marketing may say a profile "shows each person the right
 * thing" only when the engine is wired into the live profile AND at least
 * this many rules personalize (enforced in `claim-gate.test.ts`).
 */
export const ONE_RIGHT_THING_CLAIM_GATE = {
  minLiveRules: 3,
} as const;

export function countPersonalizingRules(): number {
  return Object.values(FEATURED_REASONS).filter(reason => reason.personalizes)
    .length;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Country names are stored free-form; compare codes, then English names. */
export function countryMatches(
  stored: string,
  visitorCode: string | null
): boolean {
  if (!visitorCode) return false;
  const code = visitorCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(code)) return false;
  const value = stored.trim();
  if (value.length === 0) return false;
  if (value.length === 2) return value.toUpperCase() === code;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return name !== undefined && name.toLowerCase() === value.toLowerCase();
  } catch {
    return false;
  }
}

function upcomingShows(
  shows: readonly FeaturedShow[],
  nowTime: number
): Array<{ show: FeaturedShow; days: number }> {
  const startOfToday = nowTime - (nowTime % DAY_MS);
  return shows
    .map(show => ({ show, time: toTime(show.startDate) }))
    .filter(
      (entry): entry is { show: FeaturedShow; time: number } =>
        entry.time !== null && entry.time >= startOfToday
    )
    .sort((a, b) => a.time - b.time)
    .map(entry => ({
      show: entry.show,
      days: (entry.time - nowTime) / DAY_MS,
    }));
}

/**
 * Picks the one featured item. Deterministic: the same input always yields
 * the same decision. Returns null only when the profile has nothing to show.
 */
export function pickOneRightThing(
  input: FeaturedInput
): FeaturedDecision | null {
  const { signals, inventory, artistPriority } = input;
  const nowTime = signals.now.getTime();
  const release = inventory.release;
  const upcoming = upcomingShows(inventory.shows, nowTime);
  const nextShow = upcoming[0] ?? null;
  const nearShow = upcoming.find(entry => entry.days <= SHOW_NEAR_DAYS) ?? null;

  const releaseTime = toTime(release?.releaseDate ?? null);
  const releaseAgeDays =
    release && !release.isUpcoming && releaseTime !== null
      ? (nowTime - releaseTime) / DAY_MS
      : null;
  const hasPlayableRelease = Boolean(release && !release.isUpcoming);

  const context: FeaturedDecision['context'] = {
    channel: signals.source.channel,
    source: signals.source.name,
    inApp: signals.inApp,
    device: signals.device,
    country: signals.country,
    returning: signals.returning,
  };

  const decide = (
    kind: FeaturedItemKind,
    reason: FeaturedReasonCode,
    refId: string | null = null
  ): FeaturedDecision => ({ kind, refId, reason, context });

  const available: Record<FeaturedItemKind, boolean> = {
    release: Boolean(release),
    show: nextShow !== null,
    merch: inventory.hasMerch,
    tip: inventory.hasTip,
    listen: inventory.hasListen,
  };

  const refFor = (kind: FeaturedItemKind): string | null => {
    if (kind === 'release') return release?.slug ?? null;
    if (kind === 'show') return nextShow?.show.id ?? null;
    return null;
  };

  // 1. The artist's own priority wins whenever it is available.
  if (artistPriority && available[artistPriority]) {
    return decide(artistPriority, 'artist_pinned', refFor(artistPriority));
  }

  // 2. A release that is counting down is the moment.
  if (release?.isUpcoming) {
    return decide('release', 'release_upcoming_countdown', release.slug);
  }

  // 3. A show in the visitor's country within two weeks is time critical.
  const soonLocal = upcoming.find(
    entry =>
      entry.days <= SHOW_SOON_DAYS &&
      countryMatches(entry.show.country, signals.country)
  );
  if (soonLocal) {
    return decide('show', 'show_in_visitor_country_soon', soonLocal.show.id);
  }

  // 4. Arrived from a streaming service: they are in listening mode.
  if (signals.source.channel === 'dsp' && hasPlayableRelease && release) {
    return decide('release', 'came_from_dsp_release', release.slug);
  }

  // 5. A new release (under 30 days) leads for everyone else.
  if (
    hasPlayableRelease &&
    release &&
    releaseAgeDays !== null &&
    releaseAgeDays <= FRESH_RELEASE_DAYS
  ) {
    return decide('release', 'fresh_release', release.slug);
  }

  // 6. Someone who has been here before has likely heard the song already.
  if (signals.returning === true && nearShow) {
    return decide('show', 'returning_visitor_show', nearShow.show.id);
  }

  // 7. A show in the visitor's country within two months.
  const nearLocal = upcoming.find(
    entry =>
      entry.days <= SHOW_NEAR_DAYS &&
      countryMatches(entry.show.country, signals.country)
  );
  if (nearLocal) {
    return decide('show', 'show_in_visitor_country', nearLocal.show.id);
  }

  // 8. An old release should not lead when a show is coming up.
  if (
    nearShow &&
    releaseAgeDays !== null &&
    releaseAgeDays > STALE_RELEASE_DAYS
  ) {
    return decide('show', 'stale_release_show_soon', nearShow.show.id);
  }

  // 9. Defaults, in the profile's long-standing order.
  if (release) return decide('release', 'default_release', release.slug);
  if (nextShow) return decide('show', 'default_show', nextShow.show.id);
  if (inventory.hasMerch) return decide('merch', 'default_merch');
  if (inventory.hasTip) return decide('tip', 'default_tip');
  if (inventory.hasListen) return decide('listen', 'default_listen');
  return null;
}
