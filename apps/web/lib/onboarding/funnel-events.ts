export const ONBOARDING_FUNNEL_EVENTS = {
  ONBOARDING_STARTED: 'onboarding_started',
  AUTH_COMPLETED: 'auth_completed',
  CHAT_STARTED: 'chat_started',
  CHAT_COMPLETED: 'chat_completed',
  QUALIFIED: 'qualified',
  WAITLIST_DECISION_RENDERED: 'waitlist_decision_rendered',
  WAITLIST_SAVE_STARTED: 'waitlist_save_started',
  WAITLIST_SAVE_FAILED: 'waitlist_save_failed',
  WAITLIST_INTAKE_REQUIRED: 'waitlist_intake_required',
  WAITLISTED: 'waitlisted',
  WAITLIST_CONFIRMATION_VIEWED: 'waitlist_confirmation_viewed',
  PROFILE_CREATED: 'profile_created',
  DASHBOARD_LOADED: 'dashboard_loaded',
} as const;

export type OnboardingFunnelEvent =
  (typeof ONBOARDING_FUNNEL_EVENTS)[keyof typeof ONBOARDING_FUNNEL_EVENTS];

export const ONBOARDING_FUNNEL_EVENT_NAMES = Object.values(
  ONBOARDING_FUNNEL_EVENTS
) as readonly OnboardingFunnelEvent[];

export function isOnboardingFunnelEvent(
  value: string
): value is OnboardingFunnelEvent {
  return ONBOARDING_FUNNEL_EVENT_NAMES.includes(value as OnboardingFunnelEvent);
}
