import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'SentryExampleAPIError';
  }
}

// A faulty API route to test Sentry's error monitoring
// Only available in development
export function GET() {
  // Guard: Return 404 in production
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  throw new SentryExampleAPIError(
    'This error is raised on the backend called by the example page.'
  );
}
