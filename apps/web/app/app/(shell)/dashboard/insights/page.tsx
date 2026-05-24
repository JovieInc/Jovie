import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

type LegacyInsightsPageProps = {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
};

function buildInsightsRedirectUrl(
  params: Record<string, string | string[] | undefined>
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
      continue;
    }

    if (typeof value === 'string') {
      query.append(key, value);
    }
  }

  const queryString = query.toString();
  return queryString
    ? `${APP_ROUTES.INSIGHTS}?${queryString}`
    : APP_ROUTES.INSIGHTS;
}

export default async function LegacyDashboardInsightsPage({
  searchParams,
}: LegacyInsightsPageProps) {
  redirect(buildInsightsRedirectUrl((await searchParams) ?? {}));
}
