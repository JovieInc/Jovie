import { and, eq, gt } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { APP_NAME, APP_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { productUpdateSubscribers } from '@/lib/db/schema/product-update-subscribers';

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
  <title>${title} | ${APP_NAME}</title>
  <style>
    body { margin: 0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { max-width: 420px; background: #fff; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    h1 { font-size: 20px; margin: 0 0 12px; color: #000; }
    p { font-size: 15px; line-height: 1.5; color: #666; margin: 0 0 24px; }
    a.btn { display: inline-block; padding: 12px 32px; background: #000; color: #fff; text-decoration: none; border-radius: 9999px; font-weight: 500; font-size: 14px; }
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
        { text: 'Go to changelog', href: `${APP_URL}/changelog` }
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
            href: `${APP_URL}/changelog#changelog-subscribe`,
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
        { text: "See what's new", href: `${APP_URL}/changelog` }
      ),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch {
    return new NextResponse(
      htmlPage(
        'Something went wrong',
        'We couldn\u2019t verify your subscription right now. Please try again later.',
        { text: 'Go to changelog', href: `${APP_URL}/changelog` }
      ),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
