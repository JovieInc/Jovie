import { APP_ROUTES } from '@/constants/routes';

export const DEFAULT_ONBOARDING_RETURN_TO = `${APP_ROUTES.ONBOARDING}?resume=dsp`;

const ALLOWED_ONBOARDING_RESUME_TARGETS = new Set([
  'spotify',
  'dsp',
  'social',
  'releases',
  'profile-ready',
]);

export function normalizeOnboardingReturnTo(raw: unknown): string {
  if (typeof raw !== 'string') {
    return DEFAULT_ONBOARDING_RETURN_TO;
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith(APP_ROUTES.ONBOARDING)) {
    return DEFAULT_ONBOARDING_RETURN_TO;
  }

  const parsed = new URL(trimmed, 'https://jovie.invalid');
  if (parsed.pathname !== APP_ROUTES.ONBOARDING) {
    return DEFAULT_ONBOARDING_RETURN_TO;
  }

  const resume = parsed.searchParams.get('resume');
  if (!resume || !ALLOWED_ONBOARDING_RESUME_TARGETS.has(resume)) {
    return DEFAULT_ONBOARDING_RETURN_TO;
  }

  return `${APP_ROUTES.ONBOARDING}?resume=${resume}`;
}
