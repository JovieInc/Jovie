import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { isUnauthorizedSessionError } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { FinanceFeatureDisabledError } from '@/lib/finance/flags';
import { getMoneyOverview } from '@/lib/finance/overview';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { MoneyOverviewClient } from './MoneyOverviewClient';

// No amounts, institutions, or metrics in metadata — ever.
export const metadata: Metadata = {
  title: 'Money | Jovie',
  robots: NOINDEX_ROBOTS,
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Private Money overview (JOV-4618). `getMoneyOverview` resolves the
 * financial owner from the session — an unauthenticated or non-owner
 * request redirects before any sensitive payload exists.
 */
export default async function MoneyPage() {
  let overview: Awaited<ReturnType<typeof getMoneyOverview>> | null = null;

  try {
    overview = await getMoneyOverview();
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      redirect(APP_ROUTES.SIGNIN);
    }
    if (error instanceof FinanceFeatureDisabledError) {
      notFound();
    }
    // Database failures can carry SQL, parameters and financial values.
    // Emit a stable operational error without the raw exception or its cause.
    await captureError(
      'Money overview failed to load',
      new Error('Money overview unavailable'),
      {
        route: 'app/money',
      }
    );
  }

  return <MoneyOverviewClient overview={overview} />;
}
