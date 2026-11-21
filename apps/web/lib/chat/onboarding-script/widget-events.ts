/**
 * Structured onboarding widget events.
 *
 * Widget completions (handle confirm, social attach, "none of these") advance
 * the guarded onboarding state machine via message metadata — never free-text
 * acks like "ok" / "k". The fallback engine and LLM path both read these.
 */

export const ONBOARDING_WIDGET_EVENTS = {
  HANDLE_CONFIRMED: 'handle_confirmed',
  SOCIAL_ATTACHED: 'social_attached',
  ARTIST_NONE_OF_THESE: 'artist_none_of_these',
} as const;

export type OnboardingWidgetEventType =
  (typeof ONBOARDING_WIDGET_EVENTS)[keyof typeof ONBOARDING_WIDGET_EVENTS];

export const ONBOARDING_WIDGET_EVENT_VALUES = Object.values(
  ONBOARDING_WIDGET_EVENTS
) as readonly OnboardingWidgetEventType[];

/**
 * Explicit guarded steps for the onboarding intake rail.
 * Advances only when the prior step's guard is satisfied.
 */
export const ONBOARDING_GUARDED_STEPS = [
  'role',
  'artist_search',
  'artist_select',
  'handle',
  'social',
  'contact',
  'waitlist_or_complete',
] as const;

export type OnboardingGuardedStep = (typeof ONBOARDING_GUARDED_STEPS)[number];

export interface OnboardingWidgetEventPayload {
  readonly onboardingEvent: OnboardingWidgetEventType;
  readonly handle?: string;
  readonly url?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOnboardingWidgetEventType(
  value: unknown
): value is OnboardingWidgetEventType {
  return (
    typeof value === 'string' &&
    (ONBOARDING_WIDGET_EVENT_VALUES as readonly string[]).includes(value)
  );
}

/** Read a structured widget event from UIMessage metadata. */
export function parseWidgetEventFromMetadata(
  metadata: unknown
): OnboardingWidgetEventPayload | null {
  if (!isRecord(metadata)) return null;
  if (!isOnboardingWidgetEventType(metadata.onboardingEvent)) return null;
  const payload: OnboardingWidgetEventPayload = {
    onboardingEvent: metadata.onboardingEvent,
  };
  if (typeof metadata.handle === 'string' && metadata.handle.trim()) {
    return {
      ...payload,
      handle: metadata.handle.replace(/^@/, '').trim().toLowerCase(),
    };
  }
  if (typeof metadata.url === 'string' && metadata.url.trim()) {
    return { ...payload, url: metadata.url.trim() };
  }
  return payload;
}

/**
 * Ack-only / empty free-text that must not advance waitlist/reservation or
 * complete access decisions. Widget events bypass this check.
 */
const INCOMPLETE_ACK_PATTERN =
  /^(k+|ok|okay|yes|y|yep|yeah|sure|cool|nice|thanks|thx|thnx|got it|done|next|kk+|mhm|mm+|uh\s*huh|alright|right|fine)$/i;

export function isIncompleteAdvanceMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < 2) return true;
  return INCOMPLETE_ACK_PATTERN.test(trimmed);
}

/**
 * Free-text that means “lock in the shown handle” while Keep is visible.
 * Live walk (2026-11-20): visitors type claim / sign me up and miss the
 * primary button; the engine re-ran handle-checking copy. Handle-by-default
 * also accepts keep / keep this draft.
 *
 * Acks (“ok” / “k”) stay non-advancing. Bare typed handles still swap/check.
 */
const HANDLE_CONFIRM_INTENT_PATTERN =
  /^(?:i\s+(?:want\s+to|wanna)\s+)?(?:claim(?:\s+(?:it|this|my(?:\s+(?:handle|profile|page))?))?|sign(?:\s+me)?\s*[-]?\s*up|confirm(?:\s+(?:it|handle|this))?|keep(?:\s+(?:it|this(?:\s+draft)?|my(?:\s+(?:handle|profile|page|draft))?))?|lock(?:\s+it(?:\s+in)?)?|take\s+it|use\s+(?:this|it)|that'?s\s+(?:me|fine)|this\s+(?:one|is\s+(?:fine|good)))(?:\s+please)?$/i;

export function isHandleConfirmIntent(text: string): boolean {
  const trimmed = text.replaceAll(/\s+/g, ' ').trim();
  if (!trimmed || isIncompleteAdvanceMessage(trimmed)) return false;
  const core = trimmed.replace(/[.!]+$/g, '').trim();
  if (!core) return false;
  return HANDLE_CONFIRM_INTENT_PATTERN.test(core);
}

/** Minimum length for free-text waitlist intake answers on required steps. */
export const MIN_MEANINGFUL_INTAKE_ANSWER_LENGTH = 2;

export function isMeaningfulIntakeAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < MIN_MEANINGFUL_INTAKE_ANSWER_LENGTH) return false;
  return !isIncompleteAdvanceMessage(trimmed);
}

/**
 * User-visible copy for accepting the match-derived handle (Title Case).
 * Boardy handle-by-default: primary is Keep, not a blank handle form.
 */
export const CONFIRM_HANDLE_CTA_LABEL = 'Keep';

/** User-visible copy for Attach Account CTA (Title Case). */
export const ATTACH_ACCOUNT_CTA_LABEL = 'Attach Account';

/** User-visible copy for artist picker escape hatch. */
export const NONE_OF_THESE_CTA_LABEL = 'None of These';

/**
 * Display text submitted with a widget event (human-readable transcript;
 * the engine keys off metadata, not this string).
 */
export function widgetEventDisplayText(
  event: OnboardingWidgetEventPayload
): string {
  switch (event.onboardingEvent) {
    case ONBOARDING_WIDGET_EVENTS.HANDLE_CONFIRMED:
      return event.handle
        ? `Confirmed handle @${event.handle}`
        : 'Confirmed handle';
    case ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED:
      return event.url ? `Attached ${event.url}` : 'Attached account';
    case ONBOARDING_WIDGET_EVENTS.ARTIST_NONE_OF_THESE:
      return 'None of these artists match';
    default: {
      const _exhaustive: never = event.onboardingEvent;
      return _exhaustive;
    }
  }
}

/** Tool-output action markers for completed widget steps. */
export const WIDGET_COMPLETION_ACTIONS = {
  HANDLE_CONFIRMED: 'handle_confirmed',
  SOCIAL_ATTACHED: 'social_attached',
} as const;
