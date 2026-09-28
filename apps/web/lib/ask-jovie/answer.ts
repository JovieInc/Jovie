/**
 * Ask Jovie — grounded answer engine for public profiles.
 *
 * Phase 1 is intentionally deterministic: every answer is assembled only
 * from the profile owner's verified/public Jovie data (bio, releases, tour
 * dates, social/DSP links). Nothing is fabricated — when the data cannot
 * answer a question, the caller offers to escalate it to the owner.
 */

export interface AskJovieRelease {
  readonly title: string;
  readonly releaseType?: string | null;
  readonly releaseDate?: string | null;
  readonly slug?: string | null;
}

export interface AskJovieTourDate {
  readonly startDate: string;
  readonly venueName?: string | null;
  readonly city: string;
  readonly region?: string | null;
  readonly country?: string | null;
}

export interface AskJovieLink {
  readonly platform: string;
  readonly url: string;
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
}

export type AskJovieAnswer =
  | { readonly kind: 'answer'; readonly text: string }
  | { readonly kind: 'unknown' };

const DSP_PLATFORMS = new Set(
  'spotify|apple_music|apple music|youtube|youtube_music|soundcloud|bandcamp|tidal|amazon_music|amazon music|deezer|pandora'.split(
    '|'
  )
);

const normalize = (value: string) => value.toLowerCase().trim();

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
  return { kind: 'answer', text: parts.join(' ') };
}

function answerStartHere(ctx: AskJovieProfileContext): AskJovieAnswer {
  const releases = sortedReleases(ctx);
  if (!releases.length) {
    return { kind: 'unknown' };
  }
  const first = releases[0];
  const suffix = ctx.username ? ` on ${ctx.displayName}'s profile` : '';
  return {
    kind: 'answer',
    text: `Start with "${first.title}" — it's ${ctx.displayName}'s most recent release${suffix}.`,
  };
}

function answerLatestRelease(ctx: AskJovieProfileContext): AskJovieAnswer {
  const releases = sortedReleases(ctx);
  if (!releases.length) return { kind: 'unknown' };
  const latest = releases[0];
  const date = latest.releaseDate
    ? `, released ${formatShowDate(latest.releaseDate)}`
    : '';
  return {
    kind: 'answer',
    text: `The latest release is "${latest.title}"${date}.`,
  };
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
  if (!releases.length) return { kind: 'unknown' };
  const titles = releases.slice(0, 5).map(r => `"${r.title}"`);
  const more = releases.length > 5 ? `, plus ${releases.length - 5} more` : '';
  return {
    kind: 'answer',
    text: `${ctx.displayName} has ${releases.length} release${
      releases.length === 1 ? '' : 's'
    } on Jovie: ${titles.join(', ')}${more}.`,
  };
}

function answerTourDates(
  question: string,
  ctx: AskJovieProfileContext
): AskJovieAnswer {
  const shows = ctx.tourDates ?? [];
  if (!shows.length) {
    return {
      kind: 'answer',
      text: `${ctx.displayName} doesn't have any upcoming shows listed on Jovie right now.`,
    };
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
    return { kind: 'answer', text: `Yes — ${list}${extra}.` };
  }

  const list = shows.slice(0, 3).map(describeTourDate).join('; ');
  if (/\b(near|in|at|la|los angeles|nyc|london|around)\b/.test(q)) {
    return {
      kind: 'answer',
      text: `Nothing listed there right now. Upcoming shows: ${list}.`,
    };
  }

  const extra = shows.length > 3 ? ` — plus ${shows.length - 3} more` : '';
  return {
    kind: 'answer',
    text: `Upcoming shows for ${ctx.displayName}: ${list}${extra}.`,
  };
}

function answerWhereToListen(ctx: AskJovieProfileContext): AskJovieAnswer {
  const dspLinks = (ctx.links ?? []).filter(isDspLink);
  if (!dspLinks.length) return { kind: 'unknown' };
  const names = dspLinks.map(link => platformLabel(link.platform)).join(', ');
  return {
    kind: 'answer',
    text: `You can listen on ${names} — the links are right here on ${ctx.displayName}'s profile.`,
  };
}

function answerSocial(ctx: AskJovieProfileContext): AskJovieAnswer {
  const social = (ctx.links ?? []).filter(link => !isDspLink(link));
  if (!social.length) return { kind: 'unknown' };
  const names = social.map(link => platformLabel(link.platform)).join(', ');
  return {
    kind: 'answer',
    text: `${ctx.displayName} is on ${names} — all linked from this profile.`,
  };
}

/**
 * Answer a visitor question from grounded profile data only.
 * Returns `{ kind: 'unknown' }` when nothing in the data supports an answer —
 * callers should then offer to route the question to the profile owner.
 */
export function answerProfileQuestion(
  rawQuestion: string,
  ctx: AskJovieProfileContext
): AskJovieAnswer {
  const q = normalize(rawQuestion);
  if (!q) return { kind: 'unknown' };

  if (/\b(hi|hello|hey|yo)\b/.test(q) && q.length < 20) {
    return {
      kind: 'answer',
      text: `Hey — I'm Jovie. Ask me anything about ${ctx.displayName}, or send them a message.`,
    };
  }

  const namedRelease = releaseMatchesQuestion(q, ctx);
  if (namedRelease) {
    const date = namedRelease.releaseDate
      ? `, released ${formatShowDate(namedRelease.releaseDate)}`
      : '';
    const type = namedRelease.releaseType ? `${namedRelease.releaseType} ` : '';
    return {
      kind: 'answer',
      text: `"${namedRelease.title}" is a ${type}release by ${ctx.displayName}${date}. You can find it on this profile.`,
    };
  }

  if (
    /\b(play|playing|shows?|tour|touring|concerts?|gigs?|live|performs?|performing|tickets?)\b/.test(
      q
    ) ||
    /\bwhen .*(come|coming|in)\b/.test(q)
  ) {
    return answerTourDates(q, ctx);
  }

  if (/\b(listen|stream|spotify|apple|soundcloud|bandcamp|hear)\b/.test(q)) {
    return answerWhereToListen(ctx);
  }

  if (
    /\b(start|first|recommend|best song|best track|where do i begin)\b/.test(q)
  ) {
    return answerStartHere(ctx);
  }

  if (
    /\b(latest|newest|new release|new music|new song|recent|dropped)\b/.test(q)
  ) {
    return answerLatestRelease(ctx);
  }

  if (/\b(albums?|eps?|releases?|discography|music|songs?|tracks?)\b/.test(q)) {
    return answerReleases(ctx);
  }

  if (/\b(instagram|tiktok|twitter|socials?|follow)\b/.test(q)) {
    return answerSocial(ctx);
  }

  if (
    /\b(who is|who are|about|bio|tell me)\b/.test(q) ||
    q.includes(normalize(ctx.displayName))
  ) {
    return answerAbout(ctx);
  }

  return { kind: 'unknown' };
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
