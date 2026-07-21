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

/** Minimum length for free-text waitlist intake answers on required steps. */
export const MIN_MEANINGFUL_INTAKE_ANSWER_LENGTH = 2;

export function isMeaningfulIntakeAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < MIN_MEANINGFUL_INTAKE_ANSWER_LENGTH) return false;
  return !isIncompleteAdvanceMessage(trimmed);
}

/** User-visible copy for Confirm Handle CTA (Title Case). */
export const CONFIRM_HANDLE_CTA_LABEL = 'Confirm Handle';

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
