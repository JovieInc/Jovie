/**
 * Residual ASS-16 one-rec hermetic gaps beyond #26382 / #26390.
 *
 * #26382: upcoming-first (title in ~160-char window), question-not-a-move
 * (pick-menu / intake patterns), inventing-stats.
 * #26390: denies-visible-catalog, empty-profile-defer.
 *
 * Still missing offline (this module):
 * - UPCOMING in the first content *sentence* with a days-left cue
 *   (greeting / what’s-next / pre-save) — whats-next-release names the title
 *   late-window style but still fails next_action without “tomorrow”/days.
 * - Planning-menu closers #26382 patterns miss (“say the word and I can help…”).
 * - Collab must draft one target (positive shape), not only ban “name your pick”.
 * - followup-do-it must call generateReleasePitch (tool presence), not only
 *   avoid intake wording.
 *
 * Offline only: no model, Gateway, or network. No production prompt copy.
 */

export type OneRecGapThemeId =
  | 'upcoming-sentence-days'
  | 'planning-menu-not-a-move'
  | 'collab-draft-one'
  | 'do-it-calls-tool';

export interface OneRecGapCheck {
  readonly id: OneRecGapThemeId;
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * Relative-time cues that prove the opener used days-left, not a bare calendar
 * date. Includes bare "Friday" (and "this Friday") so quality-bar openers like
 * "Night Swim is out Friday" fail-close only when the title or cue is missing —
 * not when the weekday is named without the word "this".
 */
export const DAYS_LEFT_CUE_PATTERN =
  /\b(?:tomorrow|today|tonight|in\s+\d+\s+days?|in\s+(?:a\s+)?(?:couple|few|two|three|four|five|six|seven)\s+days?|(?:this\s+)?friday|\d+\s+days?\s+(?:left|out|away))\b/i;

/**
 * Planning menus that score next_action ≤1 even when an UPCOMING title appears.
 * Kept distinct from #26382 pick-menu / intake patterns.
 */
export const PLANNING_MENU_NOT_A_MOVE_PATTERNS: readonly RegExp[] = [
  /\bsay the word and i can help\b/i,
  /\bsmart links,\s*release plan\b/i,
  /\brelease plan,\s*promo strategy\b/i,
  /\bpromo strategy,?\s*or a pitch\b/i,
  /\bhere are (?:a few |some )?(?:options|things i can|ways i can)\b/i,
];

/** Collab replies that list candidates then make the artist pick. */
export const COLLAB_PICK_MENU_PATTERNS: readonly RegExp[] = [
  /\bsay the word and name your pick\b/i,
  /\bname your pick\b/i,
  /\bdraft a collaborator pitch for one of these (?:two|three)\b/i,
  /\bwhich (?:artist|one) (?:do you|should i|would you)\b/i,
];

/** Positive: drafted outreach for one concrete target. */
export const COLLAB_DRAFT_ONE_PATTERNS: readonly RegExp[] = [
  /\bdraft(?:ing)? (?:a |the )?(?:collab(?:orator)? |outreach |pitch ).{0,80}\bfor\b/i,
  /\bone (?:outreach|collab) (?:move|draft)\b/i,
  /\bdraft(?:ed|ing)? .{0,60}\b(?:outreach|collab(?:oration)?|pitch)\b.{0,40}\b(?:artist|for)\b/i,
];

function stripLeadingGreeting(text: string): string {
  return text.trim().replace(/^(?:hey|hi|hello|yo)[.!,]?\s+/i, '');
}

/** First content sentence after a short greeting token. */
export function firstContentSentence(text: string): string {
  const body = stripLeadingGreeting(text);
  const match = body.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match?.[0] ?? body.split(/\n/)[0] ?? body).trim();
}

export function hasDaysLeftCue(text: string): boolean {
  return DAYS_LEFT_CUE_PATTERN.test(text);
}

/**
 * True when the first content sentence names the UPCOMING title and a
 * days-left cue (tomorrow / today / in N days / this Friday).
 */
export function upcomingInFirstSentenceWithDays(
  text: string,
  upcomingTitle: string
): boolean {
  const sentence = firstContentSentence(text).toLowerCase();
  return (
    sentence.includes(upcomingTitle.toLowerCase()) && hasDaysLeftCue(sentence)
  );
}

export function isPlanningMenuCloser(text: string): boolean {
  return PLANNING_MENU_NOT_A_MOVE_PATTERNS.some(pattern => pattern.test(text));
}

export function isCollabPickMenu(text: string): boolean {
  return COLLAB_PICK_MENU_PATTERNS.some(pattern => pattern.test(text));
}

export function draftsOneCollabTarget(text: string): boolean {
  if (isCollabPickMenu(text)) return false;
  // Numbered two-candidate menus are not a single draft.
  if (/\n\s*1\.\s+[\s\S]{0,200}\n\s*2\.\s+/i.test(text)) return false;
  return COLLAB_DRAFT_ONE_PATTERNS.some(pattern => pattern.test(text));
}

export function doItCallsExpectedTool(
  toolCalls: readonly { readonly name: string }[],
  expectedTool: string
): boolean {
  return toolCalls.some(call => call.name === expectedTool);
}

/**
 * Run residual one-rec gap checks. Callers enable only the themes that apply
 * to the turn shape (planning opener, collab ask, do-it followup).
 */
export function runOneRecGapChecks(
  text: string,
  options?: {
    readonly upcomingTitle?: string;
    readonly requireCollabDraftOne?: boolean;
    readonly expectedTool?: string;
    readonly toolCalls?: readonly { readonly name: string }[];
  }
): OneRecGapCheck[] {
  const checks: OneRecGapCheck[] = [];

  if (options?.upcomingTitle) {
    const ok = upcomingInFirstSentenceWithDays(text, options.upcomingTitle);
    checks.push({
      id: 'upcoming-sentence-days',
      ok,
      detail: ok
        ? undefined
        : `first content sentence missing "${options.upcomingTitle}" + days-left cue`,
    });

    const menuOk = !isPlanningMenuCloser(text);
    checks.push({
      id: 'planning-menu-not-a-move',
      ok: menuOk,
      detail: menuOk
        ? undefined
        : 'matched planning-menu closer (not a dated next move)',
    });
  }

  if (options?.requireCollabDraftOne) {
    const ok = draftsOneCollabTarget(text);
    checks.push({
      id: 'collab-draft-one',
      ok,
      detail: ok
        ? undefined
        : 'collab reply did not draft one target (pick-menu or multi-candidate)',
    });
  }

  if (options?.expectedTool) {
    const ok = doItCallsExpectedTool(
      options.toolCalls ?? [],
      options.expectedTool
    );
    checks.push({
      id: 'do-it-calls-tool',
      ok,
      detail: ok
        ? undefined
        : `expected tool ${options.expectedTool} was not called`,
    });
  }

  return checks;
}
