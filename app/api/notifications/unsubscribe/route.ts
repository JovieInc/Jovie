import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';

// Schema for unsubscription request validation
const unsubscribeSchema = z.object({
  artist_id: z.string().uuid(),
  email: z.string().email().optional(),
  token: z.string().optional(),
  method: z.enum(['email_link', 'dashboard', 'api']).default('api'),
});

/**
 * POST handler for notification unsubscriptions
 * Implements server-side analytics tracking for unsubscription events
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const result = unsubscribeSchema.safeParse(body);

    // Track unsubscription attempt with analytics
    await trackServerEvent('notifications_unsubscribe_attempt', {
      artist_id: body.artist_id,
      method: body.method || 'api',
    });

    // If validation fails, return error
    if (!result.success) {
      // Track validation error
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id: body.artist_id,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
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

    const { artist_id, email, token, method } = result.data;

    // Ensure at least one identifier is provided
    if (!email && !token) {
      // Track error - missing identifiers
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id,
        error_type: 'missing_identifier',
        method,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Either email or token must be provided',
        },
        { status: 400 }
      );
    }

    // In a real implementation, we would:
    // 1. Verify the token if provided
    // 2. Find the contact by email hash or token
    // 3. Remove the subscription for the specified artist
    // 4. Return success or appropriate error

    // For now, we'll just simulate success
    // This would be replaced with actual database operations

    // Track successful unsubscription
    await trackServerEvent('notifications_unsubscribe_success', {
      artist_id,
      method,
    });

    return NextResponse.json({
      success: true,
      message: 'Unsubscription successful',
    });
  } catch (error) {
    // Track unexpected error
    await trackServerEvent('notifications_unsubscribe_error', {
      error_type: 'server_error',
      error_message: error instanceof Error ? error.message : String(error),
    });

    console.error('[Notifications Unsubscribe] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
      },
      { status: 500 }
    );
  }
}
