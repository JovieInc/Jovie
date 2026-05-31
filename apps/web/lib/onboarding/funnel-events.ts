export const ONBOARDING_FUNNEL_EVENTS = {
  ONBOARDING_STARTED: 'onboarding_started',
  AUTH_COMPLETED: 'auth_completed',
  CHAT_STARTED: 'chat_started',
  CHAT_COMPLETED: 'chat_completed',
  QUALIFIED: 'qualified',
  WAITLISTED: 'waitlisted',
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
