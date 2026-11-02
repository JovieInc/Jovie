import { getProfileUrl } from '@/constants/domains';

/**
 * System-1 answers for signed-in artist chat: questions the server can answer
 * from facts it already loaded this turn (profile, links, catalog), streamed
 * without a model call so the first visible word lands in well under 2s.
 *
 * Truthfulness contract: every sentence is either an action or a fact read
 * from `KnownStateFacts`. No counts, rates or projections are stated, so the
 * reply can never invent a number. Anything the patterns do not match goes to
 * the model as before.
 */

type KnownStateIntent = 'weekly_growth';

interface KnownStateFacts {
  readonly username: string;
  readonly hasMusicLinks: boolean;
  readonly hasSocialLinks: boolean;
  readonly releases: ReadonlyArray<{
    readonly title: string;
    readonly releaseDate: string | null;
  }>;
}

const MAX_MATCH_LENGTH = 140;
const RECENT_RELEASE_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;
const GOAL = String.raw`(?:get|grow|gain|find|reach)\s+(?:more\s+)?(?:new\s+)?(?:listeners|streams|fans|plays|followers)`;
const TRAILER = String.raw`\s*[?.!]*$`;

// Whole-message patterns only: a longer or more specific question goes to the
// model, which can use the conversation and tools.
const WEEKLY_GROWTH_PATTERNS: readonly RegExp[] = [
  new RegExp(
    String.raw`^(?:so\s+|ok(?:ay)?\s+)?what\s+should\s+i\s+(?:do|focus\s+on|work\s+on)\s+(?:this|next)\s+week(?:\s+to\s+${GOAL})?${TRAILER}`,
    'i'
  ),
  new RegExp(
    String.raw`^how\s+(?:do|can|could|should)\s+i\s+${GOAL}(?:\s+this\s+week)?${TRAILER}`,
    'i'
  ),
];

export function matchKnownStateIntent(
  text: string | null | undefined
): KnownStateIntent | null {
  const trimmed = text?.trim() ?? '';
  if (!trimmed || trimmed.length > MAX_MATCH_LENGTH) return null;
  return WEEKLY_GROWTH_PATTERNS.some(pattern => pattern.test(trimmed))
    ? 'weekly_growth'
    : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function releaseStep(releases: KnownStateFacts['releases'], now: Date): string {
  const dated = releases
    .map(release => ({
      title: release.title,
      date: parseDate(release.releaseDate),
    }))
    .filter(
      (release): release is { title: string; date: Date } =>
        release.date !== null && release.title.trim().length > 0
    );
  const upcoming = dated
    .filter(release => release.date.getTime() > now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  if (upcoming) {
    return `Build up to ${upcoming.title}, out ${formatDay(upcoming.date)}. Post one short teaser a day and point every post at your profile so fans are ready on release day.`;
  }
  const latest = dated
    .filter(release => release.date.getTime() <= now.getTime())
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  if (latest) {
    const ageDays = (now.getTime() - latest.date.getTime()) / DAY_MS;
    return ageDays <= RECENT_RELEASE_DAYS
      ? `Keep pushing ${latest.title}, out ${formatDay(latest.date)}. Share a fresh clip, story or behind-the-scenes post about it every day this week.`
      : `Give ${latest.title} a second push. Post a short clip of it with a line about what the song means to you.`;
  }
  return 'Tell me about your next release, or add your music to your profile, so I can plan the week around a specific song.';
}

/**
 * Builds the weekly growth answer from known profile state. Returns null when
 * the intent is not recognised so the caller falls through to the model.
 */
export function buildKnownStateAnswer(input: {
  readonly text: string | null | undefined;
  readonly facts: KnownStateFacts;
  readonly now?: Date;
}): { readonly intent: KnownStateIntent; readonly text: string } | null {
  const intent = matchKnownStateIntent(input.text);
  if (!intent) return null;
  const { facts } = input;
  const steps: string[] = [];
  if (!facts.hasMusicLinks) {
    steps.push(
      'Add your streaming links. Your profile has no music links yet, so a new visitor has nowhere to press play.'
    );
  }
  steps.push(releaseStep(facts.releases, input.now ?? new Date()));
  if (!facts.hasSocialLinks) {
    steps.push(
      'Add your socials to your profile so someone who likes the first play can follow you.'
    );
  }
  steps.push(
    `Put ${getProfileUrl(facts.username)} in every bio and post this week so all of that attention lands in one place.`
  );
  const list = steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  return {
    intent,
    text: `Here is where I would focus this week:\n\n${list}\n\nWant me to turn this into a day-by-day plan?`,
  };
}
