/**
 * Normal Link Redirect Handler (/go/:id)
 * Fast redirects for normal (non-sensitive) links with anti-cloaking compliance
 */

import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import {
  getWrappedLink,
  incrementClickCount,
} from '@/lib/services/link-wrapping';
import { detectBot, getBotSafeHeaders } from '@/lib/utils/bot-detection';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const shortId = id;

  if (!shortId || shortId.length > 20) {
    return new NextResponse('Not Found', { status: 404 });
  }

  try {
    // Detect bot status
    const botResult = detectBot(request, `/go/${shortId}`);

    // Get wrapped link
    const wrappedLink = await getWrappedLink(shortId);

    if (!wrappedLink) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Ensure this is a normal (non-sensitive) link
    if (wrappedLink.kind === 'sensitive') {
      // Redirect sensitive links to interstitial page
      const interstitialUrl = new URL(`/out/${shortId}`, request.url);
      return NextResponse.redirect(interstitialUrl, { status: 302 });
    }

    // Increment click count asynchronously (don't wait)
    incrementClickCount(shortId).catch(error => {
      Sentry.captureException(error);
    });

    // Create redirect response with anti-cloaking headers
    const response = NextResponse.redirect(wrappedLink.originalUrl, {
      status: 302,
    });

    // Add security headers
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set(
      'X-Robots-Tag',
      'noindex, nofollow, nosnippet, noarchive'
    );
    response.headers.set(
      'Cache-Control',
      'no-cache, no-store, must-revalidate'
    );
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    // Add bot-safe headers if needed
    if (botResult.isBot) {
      const botHeaders = getBotSafeHeaders(true);
      Object.entries(botHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error) {
    Sentry.captureException(error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// Handle other HTTP methods
export async function POST() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function PUT() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function DELETE() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
