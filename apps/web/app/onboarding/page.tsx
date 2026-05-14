import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

type OnboardingSearchParams = Record<string, string | readonly string[]>;

interface OnboardingPageProps {
  readonly searchParams?: Promise<OnboardingSearchParams>;
}

function buildStartRedirect(searchParams: OnboardingSearchParams = {}): string {
  const targetParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      if (value) targetParams.set(key, value);
    } else {
      for (const item of value) {
        if (item) targetParams.append(key, item);
      }
    }
  }

  const query = targetParams.toString();
  return query ? `${APP_ROUTES.START}?${query}` : APP_ROUTES.START;
}

/**
 * Legacy onboarding form route.
 *
 * `/start` is now the canonical chat onboarding entry point. Keep this route
 * as a compatibility shim so existing links, tests, and emails land in the
 * chat without losing resume or claim context.
 */
export default async function OnboardingPage({
  searchParams,
}: Readonly<OnboardingPageProps>) {
  redirect(buildStartRedirect(await searchParams));
}
