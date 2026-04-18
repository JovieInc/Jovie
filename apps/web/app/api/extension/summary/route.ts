import { NextResponse } from 'next/server';
import { createExtensionCorsHeaders } from '@/lib/extensions/http';
import { buildExtensionSummary } from '@/lib/extensions/summary';
import { logger } from '@/lib/utils/logger';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pageUrl = url.searchParams.get('url');
    const pageTitle = url.searchParams.get('title');

    if (!pageUrl) {
      return NextResponse.json(
        { error: 'Missing page URL' },
        {
          status: 400,
          headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
        }
      );
    }

    const summary = await buildExtensionSummary({
      pageUrl,
      pageTitle,
    });

    return NextResponse.json(summary, {
      headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
    });
  } catch (error) {
    logger.error('Extension summary request failed:', error);

    if (
      error instanceof Error &&
      (error.message === 'Unauthorized' || error.message === 'User not found')
    ) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
        }
      );
    }

    return NextResponse.json(
      { error: 'Unable to load extension context right now.' },
      {
        status: 500,
        headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
      }
    );
  }
}
