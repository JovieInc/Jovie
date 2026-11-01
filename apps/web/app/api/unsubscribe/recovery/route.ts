import { type NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { addSuppression } from '@/lib/notifications/suppression';

const HEADERS = { 'Cache-Control': 'no-store', 'Content-Type': 'text/html' };

const page = (message: string, form = '') =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem"><p>${message}</p>${form}</body>`;

/** Confirmation page. Mail scanners that prefetch links must not unsubscribe. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token || !verifyUnsubscribeToken(token)) {
    return new NextResponse(page('This link is invalid or has expired.'), {
      status: 400,
      headers: HEADERS,
    });
  }
  const form = `<form method="post" action="?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`;
  return new NextResponse(
    page('Stop emails from Jovie about your signup?', form),
    {
      headers: HEADERS,
    }
  );
}

/** Also serves RFC 8058 one-click (POST with List-Unsubscribe=One-Click). */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const email = token ? verifyUnsubscribeToken(token) : null;
  if (!email) {
    return new NextResponse(page('This link is invalid or has expired.'), {
      status: 400,
      headers: HEADERS,
    });
  }
  const result = await addSuppression(
    email,
    'user_request',
    'recovery_unsubscribe',
    {
      metadata: { notes: 'Unsubscribed via recovery email link' },
    }
  );
  if (!result.success) {
    return new NextResponse(page('Something went wrong. Please try again.'), {
      status: 500,
      headers: HEADERS,
    });
  }
  return new NextResponse(page('You are unsubscribed. No more of these.'), {
    headers: HEADERS,
  });
}
