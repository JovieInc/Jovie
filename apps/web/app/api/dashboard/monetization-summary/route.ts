import { NextResponse } from 'next/server';
import {
  getDashboardDataFresh,
  getProfileSocialLinks,
} from '@/app/app/(shell)/dashboard/actions';
import { requireAuth } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { resolveProfileMonetizationSummary } from '@/lib/profile-monetization';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  try {
    await requireAuth();

    const dashboardData = await getDashboardDataFresh();
    const profileId = dashboardData.selectedProfile?.id ?? null;
    const socialLinks =
      profileId === null ? [] : await getProfileSocialLinks(profileId);
    const hasVenmoLink = socialLinks.some(
      link => link.platform === 'venmo' && link.isActive !== false
    );

    const stripeConnectEnabled = await getAppFlagValue(
      'STRIPE_CONNECT_ENABLED'
    );

    const payload = resolveProfileMonetizationSummary({
      username: dashboardData.selectedProfile?.username,
      stripeConnectEnabled,
      stripeAccountId: dashboardData.selectedProfile?.stripeAccountId,
      stripeOnboardingComplete:
        dashboardData.selectedProfile?.stripeOnboardingComplete,
      stripePayoutsEnabled: dashboardData.selectedProfile?.stripePayoutsEnabled,
      hasVenmoHandle:
        (dashboardData.selectedProfile?.venmoHandle?.trim().length ?? 0) > 0,
      hasVenmoLink,
      tipVisits: dashboardData.tippingStats.tipClicks,
      tipsReceived: dashboardData.tippingStats.tipsSubmitted,
      totalReceivedCents: dashboardData.tippingStats.totalReceivedCents,
      monthReceivedCents: dashboardData.tippingStats.monthReceivedCents,
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Failed to fetch monetization summary', error, {
      route: '/api/dashboard/monetization-summary',
    });

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch monetization summary' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
