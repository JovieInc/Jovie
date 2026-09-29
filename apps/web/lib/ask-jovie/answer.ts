/**
 * Ask Jovie — grounded answer engine for public profiles.
 *
 * Phase 1 is intentionally deterministic: every answer is assembled only
 * from the profile owner's verified/public Jovie data (bio, releases, tour
 * dates, social/DSP links). Nothing is fabricated — when the data cannot
 * answer a question, the caller offers to escalate it to the owner.
 */

import {
  contactToEntityCard,
  merchToEntityCard,
  releaseToEntityCard,
  showToEntityCard,
} from '@/components/organisms/entity-card/adapters';
import type { EntityCardModel } from '@/components/organisms/entity-card/types';
import type { PublicMerchCard } from '@/lib/merch/types';

export interface AskJovieRelease {
  readonly id?: string | null;
  readonly title: string;
  readonly releaseType?: string | null;
  readonly releaseDate?: string | null;
  readonly slug?: string | null;
  readonly artworkUrl?: string | null;
  readonly artistNames?: readonly string[];
}

export interface AskJovieTourDate {
  readonly id?: string | null;
  readonly title?: string | null;
  readonly startDate: string;
  readonly venueName?: string | null;
  readonly city: string;
  readonly region?: string | null;
  readonly country?: string | null;
  readonly timezone?: string | null;
  readonly ticketUrl?: string | null;
  readonly ticketStatus?: 'available' | 'sold_out' | 'cancelled' | null;
}

export interface AskJovieLink {
  readonly platform: string;
  readonly url: string;
}

export interface AskJovieContact {
  readonly id: string;
  readonly roleLabel: string;
  readonly contactName?: string | null;
  readonly companyLabel?: string | null;
}

export interface AskJovieProfileContext {
  readonly username: string;
  readonly displayName: string;
  readonly bio?: string | null;
  readonly location?: string | null;
  readonly genres?: readonly string[] | null;
  readonly releases?: readonly AskJovieRelease[];
  readonly latestRelease?: AskJovieRelease | null;
  readonly tourDates?: readonly AskJovieTourDate[];
  readonly links?: readonly AskJovieLink[];
  readonly merch?: readonly PublicMerchCard[];
  readonly contacts?: readonly AskJovieContact[];
}

export const ASK_JOVIE_QUESTION_INTENTS = [
  'greeting',
  'profile',
  'latest_release',
  'release_recommendation',
  'release_lookup',
  'releases',
  'listen',
  'upcoming_event',
  'merch',
  'video',
  'official_links',
  'business',
  'notifications',
  'unknown',
] as const;

export type AskJovieQuestionIntent =
  (typeof ASK_JOVIE_QUESTION_INTENTS)[number];

export interface AskJovieRoutingTelemetry {
  readonly classifierTier: 1;
  readonly answerTier: 0 | null;
  readonly strategy: 'deterministic';
  readonly model: null;
  readonly modelCalls: 0;
  readonly inputTokens: 0;
  readonly outputTokens: 0;
  readonly toolCalls: 0;
  readonly fullyLoadedCostUsd: 0;
}

export interface AskJovieAnswerProvenance {
  readonly sourceRevision: string;
  /** Normalized key: never contains the visitor's raw question. */
  readonly cacheKey: string | null;
  readonly entityIds: readonly string[];
}

export interface AskJovieFollowUp {
  readonly intent: 'new_release_alerts' | 'local_show_alerts';
  readonly label: string;
}

export type AskJovieAnswer =
  | {
      readonly kind: 'answer';
      readonly text: string;
      readonly intent: Exclude<AskJovieQuestionIntent, 'unknown'>;
      readonly card?: EntityCardModel;
      readonly followUp?: AskJovieFollowUp;
      readonly routing: AskJovieRoutingTelemetry;
      readonly provenance: AskJovieAnswerProvenance;
    }
  | {
      readonly kind: 'unknown';
      readonly intent: 'unknown';
      readonly routing: AskJovieRoutingTelemetry;
      readonly provenance: AskJovieAnswerProvenance;
    };

export interface AskJovieContextNeeds {
  readonly releases?: boolean;
  readonly tourDates?: boolean;
  readonly merch?: boolean;
}

const DETERMINISTIC_ROUTING: AskJovieRoutingTelemetry = {
  classifierTier: 1,
  answerTier: 0,
  strategy: 'deterministic',
  model: null,
  modelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  toolCalls: 0,
  fullyLoadedCostUsd: 0,
};

const DSP_PLATFORMS = new Set(
  'spotify|apple_music|apple music|youtube|youtube_music|soundcloud|bandcamp|tidal|amazon_music|amazon music|deezer|pandora'.split(
    '|'
  )
);

const normalize = (value: string) => value.toLowerCase().trim();

/**
 * Deterministic natural-language routing for public Ask Jovie. This is the
 * only classifier on the public path: known jobs resolve to structured data;
 * unknown jobs fail honestly instead of escalating to a model by default.
 */
export function classifyAskJovieQuestion(
  rawQuestion: string
): AskJovieQuestionIntent {
  const q = normalize(rawQuestion);
  if (!q) return 'unknown';
  if (/\b(hi|hello|hey|yo)\b/.test(q) && q.length < 20) return 'greeting';
  if (
    /\b(book|booking|business|manager|management|press|media|contact|inquiry|collab|collaborat)\w*\b/.test(
      q
    )
  ) {
    return 'business';
  }
  if (/\b(merch|merchandise|shirt|hoodie|vinyl|shop|store|buy)\b/.test(q)) {
    return 'merch';
  }
  if (/\b(video|watch|youtube|visuali[sz]er)\b/.test(q)) return 'video';
  if (
    /\b(play|playing|shows?|tour|touring|concerts?|gigs?|live|performs?|performing|tickets?)\b/.test(
      q
    ) ||
    /\bwhen .*(come|coming|in)\b/.test(q)
  ) {
    return 'upcoming_event';
  }
  if (/\b(notify|notification|alerts?|let me know|updates?)\b/.test(q)) {
    return 'notifications';
  }
  if (/\b(listen|stream|spotify|apple|soundcloud|bandcamp|hear)\b/.test(q)) {
    return 'listen';
  }
  if (
    /\b(start|first|recommend|best song|best track|where do i begin)\b/.test(q)
  ) {
    return 'release_recommendation';
  }
  if (
    /\b(latest|newest|new release|new music|new song|recent|dropped)\b/.test(q)
  ) {
    return 'latest_release';
  }
  if (
    /\b(albums?|eps?|releases?|discography|music|songs?|tracks?|credits?)\b/.test(
      q
    )
  ) {
    return 'releases';
  }
  if (
    /\b(instagram|tiktok|twitter|socials?|official links?|follow)\b/.test(q)
  ) {
    return 'official_links';
  }
  if (
    /\b(who is|who are|bio)\b/.test(q) ||
    /\babout (this|the) artist\b/.test(q)
  ) {
    return 'profile';
  }
  if (/\b(tell me about|release date|released|credit)\b/.test(q)) {
    return 'release_lookup';
  }
  return 'unknown';
}

export function contextNeedsForAskJovieIntent(
  intent: AskJovieQuestionIntent
): AskJovieContextNeeds {
  return {
    releases: [
      'latest_release',
      'release_recommendation',
      'release_lookup',
      'releases',
      'listen',
      'video',
    ].includes(intent),
    tourDates: intent === 'upcoming_event',
    merch: intent === 'merch',
  };
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/** Revision of only public, normalized source data; no visitor text enters it. */
export function getAskJovieSourceRevision(ctx: AskJovieProfileContext): string {
  const source = {
    username: ctx.username,
    displayName: ctx.displayName,
    bio: ctx.bio ?? null,
    location: ctx.location ?? null,
    genres: ctx.genres ?? [],
    releases: sortedReleases(ctx).map(release => ({
      id: release.id ?? null,
      title: release.title,
      type: release.releaseType ?? null,
      date: release.releaseDate ?? null,
      slug: release.slug ?? null,
      artwork: release.artworkUrl ?? null,
      artists: release.artistNames ?? [],
    })),
    tourDates: (ctx.tourDates ?? []).map(show => ({
      id: show.id ?? null,
      title: show.title ?? null,
      date: show.startDate,
      venue: show.venueName ?? null,
      city: show.city,
      region: show.region ?? null,
      country: show.country ?? null,
      tickets: show.ticketUrl ?? null,
      ticketStatus: show.ticketStatus ?? null,
    })),
    merch: (ctx.merch ?? []).map(item => ({
      id: item.id,
      title: item.title,
      status: item.status,
      image: item.primaryImageUrl,
      price: item.retailPriceCents,
    })),
    contacts: (ctx.contacts ?? []).map(contact => ({
      id: contact.id,
      role: contact.roleLabel,
      name: contact.contactName ?? null,
      company: contact.companyLabel ?? null,
    })),
    links: ctx.links ?? [],
  };
  return `ask-jovie-v1-${stableHash(JSON.stringify(source))}`;
}

function unknownAnswer(ctx: AskJovieProfileContext): AskJovieAnswer {
  return {
    kind: 'unknown',
    intent: 'unknown',
    routing: { ...DETERMINISTIC_ROUTING, answerTier: null },
    provenance: {
      sourceRevision: getAskJovieSourceRevision(ctx),
      cacheKey: null,
      entityIds: [],
    },
  };
}

function structuredAnswer(
  ctx: AskJovieProfileContext,
  input: {
    readonly intent: Exclude<AskJovieQuestionIntent, 'unknown'>;
    readonly text: string;
    readonly card?: EntityCardModel;
    readonly entityIds?: readonly string[];
    readonly followUp?: AskJovieFollowUp;
    readonly cacheable?: boolean;
  }
): AskJovieAnswer {
  const sourceRevision = getAskJovieSourceRevision(ctx);
  const entityIds = input.entityIds ?? (input.card ? [input.card.id] : []);
  const entityKey = entityIds.length > 0 ? entityIds.join(',') : 'profile';
  return {
    kind: 'answer',
    text: input.text,
    intent: input.intent,
    card: input.card,
    followUp: input.followUp,
    routing: DETERMINISTIC_ROUTING,
    provenance: {
      sourceRevision,
      cacheKey:
        input.cacheable === false || input.card?.status?.tone === 'scheduled'
          ? null
          : `ask-jovie:answer:v1:${encodeURIComponent(ctx.username)}:${input.intent}:${encodeURIComponent(entityKey)}:${sourceRevision}`,
      entityIds,
    },
  };
}

const isDspLink = (link: AskJovieLink) =>
  DSP_PLATFORMS.has(normalize(link.platform));

const DSP_DISPLAY_NAMES: Record<string, string> = {
  'apple music': 'Apple Music',
  'youtube music': 'YouTube Music',
  'amazon music': 'Amazon Music',
};

function platformLabel(platform: string): string {
  const key = normalize(platform).replaceAll(/[_-]/g, ' ');
  return (
    DSP_DISPLAY_NAMES[key] ??
    key
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

function formatShowDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function describeReleaseDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const verb =
    new Date(isoDate).getTime() > Date.now() ? 'releasing' : 'released';
  return `, ${verb} ${formatShowDate(isoDate)}`;
}

function describeTourDate(show: AskJovieTourDate): string {
  const place = [show.venueName, show.city, show.region ?? show.country]
    .filter(Boolean)
    .join(', ');
  return `${formatShowDate(show.startDate)} — ${place}`.trim();
}

function sortedReleases(ctx: AskJovieProfileContext): AskJovieRelease[] {
  const releases = [...(ctx.releases ?? [])];
  releases.sort((a, b) =>
    (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')
  );
  if (
    ctx.latestRelease &&
    !releases.some(r => r.title === ctx.latestRelease?.title)
  ) {
    releases.unshift(ctx.latestRelease);
  }
  return releases;
}

function releaseCard(
  release: AskJovieRelease,
  ctx: AskJovieProfileContext,
  kind: 'music' | 'video' = 'music'
): EntityCardModel | undefined {
  const slug = release.slug?.trim();
  if (!slug) return undefined;
  return releaseToEntityCard(
    {
      id: release.id ?? undefined,
      title: release.title,
      slug,
      artworkUrl: release.artworkUrl,
      releaseDate: release.releaseDate,
      releaseType: release.releaseType,
    },
    { handle: ctx.username, kind }
  );
}

function showCard(
  show: AskJovieTourDate,
  ctx: AskJovieProfileContext
): EntityCardModel {
  const card = showToEntityCard({
    id: show.id ?? `${show.startDate}:${show.city}`,
    title: show.title,
    venueName: show.venueName,
    city: show.city,
    startDate: show.startDate,
    timezone: show.timezone,
    ticketUrl: show.ticketUrl,
    ticketStatus: show.ticketStatus,
  });
  if (show.ticketUrl || show.ticketStatus === 'cancelled') return card;
  const href = `/${encodeURIComponent(ctx.username)}?mode=subscribe`;
  return {
    ...card,
    href,
    cta: { label: 'Notify Me', href },
  };
}

function alertsCard(ctx: AskJovieProfileContext): EntityCardModel {
  const href = `/${encodeURIComponent(ctx.username)}?mode=subscribe`;
  return {
    id: `alerts-${ctx.username}`,
    kind: 'alerts',
    href,
    imageUrl: null,
    imageAlt: `Alerts for ${ctx.displayName}`,
    eyebrow: ctx.displayName,
    title: 'Release and Show Alerts',
    meta: 'Choose only the updates you want.',
    cta: { label: 'Get Updates', href },
  };
}

function answerAbout(ctx: AskJovieProfileContext): AskJovieAnswer {
  const parts: string[] = [
    ctx.bio?.trim()
      ? `${ctx.displayName} — ${ctx.bio.trim()}`
      : `${ctx.displayName} is on Jovie.`,
  ];
  const facts: string[] = [];
  if (ctx.genres?.length) {
    facts.push(`Genres: ${ctx.genres.slice(0, 4).join(', ')}`);
  }
  if (ctx.location?.trim()) {
    facts.push(`Based in ${ctx.location.trim()}`);
  }
  if (facts.length) parts.push(`${facts.join('. ')}.`);
  return structuredAnswer(ctx, {
    intent: 'profile',
    text: parts.join(' '),
  });
}

function answerStartHere(ctx: AskJovieProfileContext): AskJovieAnswer {
  const releases = sortedReleases(ctx);
  if (!releases.length) {
    return unknownAnswer(ctx);
  }
  const first = releases[0];
  return structuredAnswer(ctx, {
    intent: 'release_recommendation',
    text: `Start with ${first.title} — it's ${ctx.displayName}'s most recent release.`,
    card: releaseCard(first, ctx),
    entityIds: first.id ? [first.id] : undefined,
    followUp: {
      intent: 'new_release_alerts',
      label: 'Want release alerts?',
    },
  });
}

function answerLatestRelease(ctx: AskJovieProfileContext): AskJovieAnswer {
  const releases = sortedReleases(ctx);
  if (!releases.length) return unknownAnswer(ctx);
  const latest = releases[0];
  const date = describeReleaseDate(latest.releaseDate);
  const possessive = ctx.displayName.endsWith('s') ? "'" : "'s";
  return structuredAnswer(ctx, {
    intent: 'latest_release',
    text: `${ctx.displayName}${possessive} latest release is ${latest.title}${date}.`,
    card: releaseCard(latest, ctx),
    entityIds: latest.id ? [latest.id] : undefined,
    followUp: {
      intent: 'new_release_alerts',
      label: 'Want release alerts?',
    },
  });
}

function releaseMatchesQuestion(
  question: string,
  ctx: AskJovieProfileContext
): AskJovieRelease | null {
  const q = normalize(question);
  return (
    sortedReleases(ctx).find(release => {
      const title = normalize(release.title);
      return title.length >= 3 && q.includes(title);
    }) ?? null
  );
}

function answerReleases(ctx: AskJovieProfileContext): AskJovieAnswer {
  const releases = sortedReleases(ctx);
  if (!releases.length) return unknownAnswer(ctx);
  const titles = releases.slice(0, 5).map(r => `"${r.title}"`);
  const more = releases.length > 5 ? `, plus ${releases.length - 5} more` : '';
  return structuredAnswer(ctx, {
    intent: 'releases',
    text: `${ctx.displayName} has ${releases.length} release${
      releases.length === 1 ? '' : 's'
    } on Jovie: ${titles.join(', ')}${more}.`,
    card: releaseCard(releases[0], ctx),
    entityIds: releases
      .slice(0, 5)
      .flatMap(release => (release.id ? [release.id] : [])),
  });
}

function answerTourDates(
  question: string,
  ctx: AskJovieProfileContext
): AskJovieAnswer {
  const shows = ctx.tourDates ?? [];
  if (!shows.length) {
    return structuredAnswer(ctx, {
      intent: 'upcoming_event',
      text: `${ctx.displayName} doesn't have any upcoming shows listed on Jovie right now.`,
      card: alertsCard(ctx),
      followUp: {
        intent: 'local_show_alerts',
        label: 'Want local show alerts?',
      },
    });
  }

  const q = normalize(question);
  const qWords = q
    .replaceAll(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const matched = shows.filter(show => {
    const hay = normalize(
      [show.city, show.region, show.country, show.venueName]
        .filter(Boolean)
        .join(' ')
    );
    const hayWords = new Set(hay.split(/\s+/));
    return qWords.some(word => word.length >= 3 && hayWords.has(word));
  });

  if (matched.length) {
    const list = matched.slice(0, 3).map(describeTourDate).join('; ');
    const extra =
      matched.length > 3 ? ` — plus ${matched.length - 3} more` : '';
    return structuredAnswer(ctx, {
      intent: 'upcoming_event',
      text: `Yes — ${list}${extra}.`,
      card: showCard(matched[0], ctx),
      entityIds: matched
        .slice(0, 3)
        .map(show => show.id ?? `${show.startDate}:${show.city}`),
      followUp:
        showCard(matched[0], ctx).cta?.label === 'Notify Me'
          ? { intent: 'local_show_alerts', label: 'Want local show alerts?' }
          : undefined,
    });
  }

  const list = shows.slice(0, 3).map(describeTourDate).join('; ');
  if (/\b(near|in|at|la|los angeles|nyc|london|around)\b/.test(q)) {
    return structuredAnswer(ctx, {
      intent: 'upcoming_event',
      text: `Nothing listed there right now. Upcoming shows: ${list}.`,
      card: showCard(shows[0], ctx),
      entityIds: shows
        .slice(0, 3)
        .map(show => show.id ?? `${show.startDate}:${show.city}`),
      followUp: {
        intent: 'local_show_alerts',
        label: 'Want local show alerts?',
      },
    });
  }

  const extra = shows.length > 3 ? ` — plus ${shows.length - 3} more` : '';
  return structuredAnswer(ctx, {
    intent: 'upcoming_event',
    text: `Upcoming shows for ${ctx.displayName}: ${list}${extra}.`,
    card: showCard(shows[0], ctx),
    entityIds: shows
      .slice(0, 3)
      .map(show => show.id ?? `${show.startDate}:${show.city}`),
    followUp:
      showCard(shows[0], ctx).cta?.label === 'Notify Me'
        ? { intent: 'local_show_alerts', label: 'Want local show alerts?' }
        : undefined,
  });
}

function answerWhereToListen(ctx: AskJovieProfileContext): AskJovieAnswer {
  const dspLinks = (ctx.links ?? []).filter(isDspLink);
  if (!dspLinks.length) return unknownAnswer(ctx);
  const names = dspLinks.map(link => platformLabel(link.platform)).join(', ');
  const latest = sortedReleases(ctx)[0];
  return structuredAnswer(ctx, {
    intent: 'listen',
    text: `You can listen on ${names} — the links are right here on ${ctx.displayName}'s profile.`,
    card: latest ? releaseCard(latest, ctx) : undefined,
    entityIds: latest?.id ? [latest.id] : [],
  });
}

function answerSocial(ctx: AskJovieProfileContext): AskJovieAnswer {
  const social = (ctx.links ?? []).filter(link => !isDspLink(link));
  if (!social.length) return unknownAnswer(ctx);
  const names = social.map(link => platformLabel(link.platform)).join(', ');
  const first = social[0];
  return structuredAnswer(ctx, {
    intent: 'official_links',
    text: `${ctx.displayName} is on ${names} — all linked from this profile.`,
    card: {
      id: `social-${ctx.username}`,
      kind: 'person',
      href: first.url,
      imageUrl: null,
      imageAlt: ctx.displayName,
      eyebrow: 'Official Link',
      title: ctx.displayName,
      meta: platformLabel(first.platform),
      cta: { label: 'View', href: first.url, external: true },
    },
    entityIds: social.map(link => link.platform),
  });
}

function answerMerch(ctx: AskJovieProfileContext): AskJovieAnswer {
  const item = ctx.merch?.[0];
  if (!item) return unknownAnswer(ctx);
  return structuredAnswer(ctx, {
    intent: 'merch',
    text: `${ctx.displayName}'s featured merch is ${item.title}.`,
    card: merchToEntityCard(item, { handle: ctx.username }),
    entityIds: [item.id],
  });
}

function answerVideo(ctx: AskJovieProfileContext): AskJovieAnswer {
  const video = sortedReleases(ctx).find(
    release => release.releaseType === 'music_video'
  );
  if (!video) return unknownAnswer(ctx);
  return structuredAnswer(ctx, {
    intent: 'video',
    text: `${ctx.displayName}'s latest video is ${video.title}.`,
    card: releaseCard(video, ctx, 'video'),
    entityIds: video.id ? [video.id] : undefined,
  });
}

function answerBusiness(ctx: AskJovieProfileContext): AskJovieAnswer {
  const contact = ctx.contacts?.[0];
  const card = contact
    ? contactToEntityCard(contact, {
        handle: ctx.username,
        ctaLabel: 'Continue Inquiry',
      })
    : contactToEntityCard(
        {
          id: `contact-${ctx.username}`,
          roleLabel: 'Business Inquiries',
        },
        { handle: ctx.username, ctaLabel: 'Send Message' }
      );
  return structuredAnswer(ctx, {
    intent: 'business',
    text: contact
      ? `${contact.roleLabel} inquiries can continue through ${contact.contactName ?? contact.companyLabel ?? ctx.displayName}'s contact route.`
      : `You can send a business inquiry to ${ctx.displayName} through this profile.`,
    card,
    entityIds: [contact?.id ?? card.id],
  });
}

function answerNotifications(ctx: AskJovieProfileContext): AskJovieAnswer {
  return structuredAnswer(ctx, {
    intent: 'notifications',
    text: `Choose the ${ctx.displayName} updates you want and Jovie will only send those.`,
    card: alertsCard(ctx),
    followUp: {
      intent: 'new_release_alerts',
      label: 'Get release alerts',
    },
  });
}

/**
 * Answer a visitor question from grounded profile data only.
 * Returns `{ kind: 'unknown' }` when nothing in the data supports an answer —
 * callers should then offer to route the question to the profile owner.
 */
export function answerProfileQuestion(
  rawQuestion: string,
  ctx: AskJovieProfileContext,
  classifiedIntent: AskJovieQuestionIntent = classifyAskJovieQuestion(
    rawQuestion
  )
): AskJovieAnswer {
  const q = normalize(rawQuestion);
  if (!q) return unknownAnswer(ctx);

  const namedRelease = releaseMatchesQuestion(q, ctx);
  if (namedRelease) {
    const date = describeReleaseDate(namedRelease.releaseDate);
    const type = namedRelease.releaseType ? `${namedRelease.releaseType} ` : '';
    const credits = namedRelease.artistNames?.filter(Boolean) ?? [];
    const creditText =
      credits.length > 0 ? ` Credits include ${credits.join(', ')}.` : '';
    return structuredAnswer(ctx, {
      intent: 'release_lookup',
      text: `${namedRelease.title} is a ${type}release by ${ctx.displayName}${date}.${creditText}`,
      card: releaseCard(
        namedRelease,
        ctx,
        namedRelease.releaseType === 'music_video' ? 'video' : 'music'
      ),
      entityIds: namedRelease.id ? [namedRelease.id] : undefined,
    });
  }

  if (
    classifiedIntent === 'release_lookup' &&
    q.includes(normalize(ctx.displayName))
  ) {
    return answerAbout(ctx);
  }

  switch (classifiedIntent) {
    case 'greeting':
      return structuredAnswer(ctx, {
        intent: 'greeting',
        text: `Hey — I'm Jovie. Ask me anything about ${ctx.displayName}, or send them a message.`,
        cacheable: false,
      });
    case 'profile':
      return answerAbout(ctx);
    case 'latest_release':
      return answerLatestRelease(ctx);
    case 'release_recommendation':
      return answerStartHere(ctx);
    case 'releases':
      return answerReleases(ctx);
    case 'listen':
      return answerWhereToListen(ctx);
    case 'upcoming_event':
      return answerTourDates(q, ctx);
    case 'merch':
      return answerMerch(ctx);
    case 'video':
      return answerVideo(ctx);
    case 'official_links':
      return answerSocial(ctx);
    case 'business':
      return answerBusiness(ctx);
    case 'notifications':
      return answerNotifications(ctx);
    default:
      return unknownAnswer(ctx);
  }
}

/** Categories a visitor-directed message can take. */
export const ASK_JOVIE_MESSAGE_CATEGORIES = [
  'fan_mail',
  'booking',
  'press',
  'collaboration',
  'business',
  'support',
  'other',
] as const;

export type AskJovieMessageCategory =
  (typeof ASK_JOVIE_MESSAGE_CATEGORIES)[number];

/** Structured follow intents a visitor can request. */
export const ASK_JOVIE_INTENTS = [
  'new_release_alerts',
  'local_show_alerts',
  'ticket_sale_alerts',
  'general_updates',
] as const;

export type AskJovieIntent = (typeof ASK_JOVIE_INTENTS)[number];
