import { resolveSafeFirstName } from '@/lib/email/templates/personalization';

/** Home welcomes the person and offers one real next step (JOV-7150). */

export function getTimeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * A person's first-and-last name greets by first name ("Tim White" -> "Tim").
 * Any other display name is an artist or band name and greets whole ("Good
 * Dropouts", "UNMARKED"), never by its first word ("Good afternoon, Good.").
 * Artists are greeted by name: the golden path asserts it.
 */
export function getChatEmptyStateFirstName(
  displayName: string | null | undefined
): string | null {
  const name = displayName?.trim().replaceAll(/\s+/g, ' ') ?? '';
  if (!name) return null;
  return resolveSafeFirstName(name, '') ?? name;
}

export function getChatEmptyStateGreetingText(
  firstName: string | null,
  date: Date = new Date()
): string {
  const timeOfDay = getTimeOfDayGreeting(date);
  return firstName ? `${timeOfDay}, ${firstName}.` : `${timeOfDay}.`;
}

/**
 * The only thing New Chat may show under the greeting: work Jovie has already
 * finished from the artist's real data, attached to the item it is about.
 * A draft waiting for approval, or a finding with its evidence. Never a chore
 * for the artist ("Review your tip flow"), never a canned suggestion without a
 * result behind it. With nothing real, New Chat shows the greeting and the
 * composer and nothing else (Tim, Nov 14 2026: "why are we asking a user again
 * to do something that is our job?").
 */
export interface ChatEmptyStateResult {
  readonly id: string;
  /** The release, channel, fan or profile the result is about. */
  readonly item: {
    readonly kind: 'release' | 'channel' | 'profile' | 'fan' | 'task';
    readonly id: string;
    readonly label: string;
  };
  /** What Jovie finished. */
  readonly result: {
    readonly kind: 'draft' | 'finding';
    /** One sentence, past tense, naming the item: "Drafted a pitch for Wheels Up." */
    readonly summary: string;
    /** Where the finished draft or finding opens. */
    readonly href: string;
  };
}

const RESULT_ACTION_LABEL: Record<
  ChatEmptyStateResult['result']['kind'],
  string
> = {
  draft: 'Review Draft',
  finding: 'Open Finding',
};

export function chatEmptyStateResultActionLabel(
  result: ChatEmptyStateResult
): string {
  return RESULT_ACTION_LABEL[result.result.kind];
}

/**
 * Wording that hands the artist a chore or promises nothing concrete. A
 * suggestion that matches is rejected, in the app and in the nightly action
 * walk (JOV-12633), which reads every New Chat suggestion with this list.
 */
const CHORE_WORDING: readonly RegExp[] = [
  /^\s*(review|check|plan|improve|optimi[sz]e|update|consider|try|explore|think about|look at|work on)\b/i,
  /\bwith jovie\b/i,
  /\byour (tip|signup|sign-up|conversion|traffic|audience|fan) (flow|sources|experience)\b/i,
  /\bnext step\b/i,
  /\bdraft this\b/i,
];

export function findChoreWording(text: string): string | null {
  for (const pattern of CHORE_WORDING) {
    const match = pattern.exec(text);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * Why a result can't be shown, or null when it can. A result needs a backing
 * item, a finished draft or finding with somewhere to open it, and a summary
 * that reports work done rather than assigning work.
 */
export function chatEmptyStateResultProblem(
  result: ChatEmptyStateResult
): string | null {
  if (!result.id.trim()) return 'missing id';
  if (!result.item.id.trim() || !result.item.label.trim())
    return 'no backing item';
  const summary = result.result.summary.trim();
  if (!summary) return 'no finished result';
  const href = result.result.href;
  if (!href.startsWith('/') || href.startsWith('//'))
    return 'result does not open';
  if (!summary.includes(result.item.label.trim()))
    return 'summary does not name its item';
  const chore = findChoreWording(summary);
  if (chore) return `chore wording: "${chore}"`;
  return null;
}

export function selectChatEmptyStateResult(
  results: readonly ChatEmptyStateResult[] | null | undefined
): ChatEmptyStateResult | null {
  return (
    (results ?? []).find(r => chatEmptyStateResultProblem(r) === null) ?? null
  );
}
