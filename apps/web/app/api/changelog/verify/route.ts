import { and, eq, gt } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { productUpdateSubscribers } from '@/lib/db/schema/product-update-subscribers';

/**
 * Standalone HTML status card for the email verification flow.
 *
 * Rendered outside the Next document tree, so System B tokens cannot reach it
 * as utilities — the inline <style> below projects the ZiaWI dark ramp by hand:
 * canvas #030406, card surface #131417, ink #f5f7fb, muted ink #a8b0c3,
 * border-default rgba(168,176,195,0.16), shadow-deep rgba(0,0,0,0.25),
 * ion #11afff reserved for the semantic focus ring. The CTA stays a neutral
 * high-contrast pill (light pill, dark text) per DESIGN.md.
 */
function htmlPage(
  title: string,
  message: string,
  cta?: { text: string; href: string }
) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>${title} | ${APP_NAME}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #030406; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { max-width: 420px; background: #131417; border: 1px solid rgba(168, 176, 195, 0.16); border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); }
    h1 { font-size: 20px; margin: 0 0 12px; color: #f5f7fb; }
    p { font-size: 15px; line-height: 1.5; color: #a8b0c3; margin: 0 0 24px; }
    a.btn { display: inline-block; padding: 12px 32px; background: #f5f7fb; color: #030406; text-decoration: none; border-radius: 9999px; font-weight: 500; font-size: 14px; }
    a.btn:focus-visible { outline: 2px solid #11afff; outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    ${cta ? `<a class="btn" href="${cta.href}">${cta.text}</a>` : ''}
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return new NextResponse(
      htmlPage(
        'Invalid link',
        'This verification link is missing or malformed.',
        { text: 'Go to changelog', href: `${BASE_URL}/changelog` }
      ),
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  try {
    const [subscriber] = await db
      .select()
      .from(productUpdateSubscribers)
      .where(
        and(
          eq(productUpdateSubscribers.verificationToken, token),
          gt(productUpdateSubscribers.tokenExpiresAt, new Date())
        )
      )
      .limit(1);

    if (!subscriber) {
      return new NextResponse(
        htmlPage(
          'Link expired',
          'This verification link has expired or was already used. Please subscribe again.',
          {
            text: 'Resubscribe',
            href: `${BASE_URL}/changelog#changelog-subscribe`,
          }
        ),
        { status: 410, headers: { 'Content-Type': 'text/html' } }
      );
    }

    await db
      .update(productUpdateSubscribers)
      .set({
        verified: true,
        verificationToken: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(productUpdateSubscribers.id, subscriber.id));

    return new NextResponse(
      htmlPage(
        "You're subscribed!",
        `You'll receive an email whenever we ship something new at ${APP_NAME}. Welcome aboard.`,
        { text: "See what's new", href: `${BASE_URL}/changelog` }
      ),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch {
    return new NextResponse(
      htmlPage(
        'Something went wrong',
        'We couldn\u2019t verify your subscription right now. Please try again later.',
        { text: 'Go to changelog', href: `${BASE_URL}/changelog` }
      ),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
