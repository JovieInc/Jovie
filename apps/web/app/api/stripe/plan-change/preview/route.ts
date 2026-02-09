/**
 * Plan Change Preview API
 *
 * Previews the proration for a plan change before executing it.
 * Shows the user exactly what they'll be charged/credited.
 *
 * POST /api/stripe/plan-change/preview
 *   - Body: { priceId: string }
 *   - Returns: ProrationPreview with amounts and timing
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { ensureStripeCustomer } from '@/lib/stripe/customer-sync';
import { previewPlanChange } from '@/lib/stripe/plan-change';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const { priceId } = body;

    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid price ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Ensure customer exists
    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      return NextResponse.json(
        { error: 'No subscription found. Use checkout to subscribe.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Get proration preview
    const preview = await previewPlanChange({
      customerId: customerResult.customerId,
      newPriceId: priceId,
    });

    if (!preview) {
      return NextResponse.json(
        {
          error:
            'Failed to preview plan change. You may not have an active subscription.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('Plan change preview generated', {
      userId,
      isUpgrade: preview.isUpgrade,
      immediateAmount: preview.immediateAmount,
    });

    // Format amounts for display
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: preview.currency.toUpperCase(),
    }).format(preview.immediateAmount / 100);

    return NextResponse.json(
      {
        ...preview,
        formattedAmount,
        effectiveDate: preview.effectiveDate.toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error previewing plan change', error);
    await captureCriticalError('Stripe plan change preview failed', error, {
      route: '/api/stripe/plan-change/preview',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to preview plan change' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Only allow POST
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST with { priceId: string }' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
