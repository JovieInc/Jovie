import { NextResponse } from 'next/server';

export async function canReadHealthDetail(): Promise<boolean> {
  return true;
}

export const HEALTH_DETAIL_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
} as const;

export function publicHealthLiveness(
  healthy: boolean,
  extraHeaders?: HeadersInit
): NextResponse {
  return NextResponse.json(
    { healthy, timestamp: new Date().toISOString() },
    {
      status: healthy ? 200 : 503,
      headers: {
        ...(extraHeaders
          ? Object.fromEntries(new Headers(extraHeaders).entries())
          : {}),
        ...HEALTH_DETAIL_HEADERS,
      },
    }
  );
}
