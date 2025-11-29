import { NextResponse } from 'next/server';

import { isAdminEmail } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { stripe } from '@/lib/stripe/client';

export const runtime = 'nodejs';

interface AdminOverviewResponse {
  mrrUsd: number;
  activeSubscribers: number;
}

export async function GET() {
  try {
    const entitlements = await getCurrentUserEntitlements();

    if (!entitlements.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminEmail(entitlements.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const mrrData = await getStripeMrr();

    const body: AdminOverviewResponse = {
      mrrUsd: mrrData.mrrUsd,
      activeSubscribers: mrrData.activeSubscribers,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error('Error in admin overview API:', error);
    return NextResponse.json(
      { error: 'Failed to load admin overview' },
      { status: 500 }
    );
  }
}

async function getStripeMrr(): Promise<{
  mrrUsd: number;
  activeSubscribers: number;
}> {
  try {
    let mrrCents = 0;
    let activeSubscribers = 0;
    let startingAfter: string | undefined;

    for (;;) {
      const page = await stripe.subscriptions.list({
        status: 'active',
        expand: ['data.items.price'],
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const sub of page.data) {
        if (!Array.isArray(sub.items.data) || sub.items.data.length === 0)
          continue;

        activeSubscribers += 1;

        for (const item of sub.items.data) {
          const price = item.price;
          if (!price || typeof price.unit_amount !== 'number') continue;

          const amount = price.unit_amount;
          const interval = price.recurring?.interval;

          if (interval === 'month') {
            mrrCents += amount;
          } else if (interval === 'year') {
            mrrCents += Math.round(amount / 12);
          }
        }
      }

      if (!page.has_more || page.data.length === 0) {
        break;
      }

      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    return {
      mrrUsd: mrrCents / 100,
      activeSubscribers,
    };
  } catch (error) {
    console.error('Error computing Stripe MRR for admin overview:', error);
    return { mrrUsd: 0, activeSubscribers: 0 };
  }
}
