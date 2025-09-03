import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';

// Schema for subscription request validation
const subscribeSchema = z.object({
  artist_id: z.string().uuid(),
  email: z.string().email(),
  source: z.string().default('profile_bell'),
});

/**
 * POST handler for notification subscriptions
 * Implements server-side analytics tracking for subscription events
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const result = subscribeSchema.safeParse(body);

    // Track subscription attempt with analytics
    await trackServerEvent('notifications_subscribe_attempt', {
      artist_id: body.artist_id,
      email_length: body.email?.length || 0,
      source: body.source || 'unknown',
    });

    // If validation fails, return error
    if (!result.success) {
      // Track validation error
      await trackServerEvent('notifications_subscribe_error', {
        artist_id: body.artist_id,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        source: body.source || 'unknown',
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: result.error.format(),
        },
        { status: 400 }
      );
    }

    const { artist_id, email, source } = result.data;

    // In a real implementation, we would:
    // 1. Hash the email
    // 2. Check if the contact already exists
    // 3. Create or update the contact
    // 4. Create the subscription
    // 5. Add to category list based on artist type

    // For now, we'll just simulate success
    // This would be replaced with actual database operations

    // Track successful subscription
    await trackServerEvent('notifications_subscribe_success', {
      artist_id,
      email_domain: email.split('@')[1],
      source,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription successful',
    });
  } catch (error) {
    // Track unexpected error
    await trackServerEvent('notifications_subscribe_error', {
      error_type: 'server_error',
      error_message: error instanceof Error ? error.message : String(error),
    });

    console.error('[Notifications Subscribe] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
      },
      { status: 500 }
    );
  }
}
