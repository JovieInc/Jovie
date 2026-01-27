import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { addSuppression } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * GET handler for unsubscribe confirmation page.
 * Shows a simple confirmation page when user clicks unsubscribe link.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse(
      renderHtmlPage({
        title: 'Invalid Link',
        message: 'This unsubscribe link is invalid or has expired.',
        success: false,
      }),
      {
        status: 400,
        headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
      }
    );
  }

  const email = verifyUnsubscribeToken(token);

  if (!email) {
    return new NextResponse(
      renderHtmlPage({
        title: 'Invalid Link',
        message: 'This unsubscribe link is invalid or has expired.',
        success: false,
      }),
      {
        status: 400,
        headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
      }
    );
  }

  // Show confirmation form
  return new NextResponse(
    renderHtmlPage({
      title: 'Unsubscribe',
      message: `Click the button below to unsubscribe from claim invite emails.`,
      success: true,
      showForm: true,
      token,
    }),
    {
      status: 200,
      headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
    }
  );
}

/**
 * POST handler for processing unsubscribe request.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const token = formData.get('token');

    if (typeof token !== 'string') {
      return new NextResponse(
        renderHtmlPage({
          title: 'Error',
          message: 'Invalid request. Please try again.',
          success: false,
        }),
        {
          status: 400,
          headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
        }
      );
    }

    const email = verifyUnsubscribeToken(token);

    if (!email) {
      return new NextResponse(
        renderHtmlPage({
          title: 'Invalid Link',
          message: 'This unsubscribe link is invalid or has expired.',
          success: false,
        }),
        {
          status: 400,
          headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
        }
      );
    }

    // Add email to suppression list
    const result = await addSuppression(
      email,
      'user_request',
      'claim_invite_unsubscribe',
      {
        metadata: { notes: 'Unsubscribed via claim invite email link' },
      }
    );

    if (!result.success && !result.alreadyExists) {
      logger.error('Failed to add suppression for claim invite unsubscribe', {
        error: result.error,
      });

      return new NextResponse(
        renderHtmlPage({
          title: 'Error',
          message: 'Something went wrong. Please try again later.',
          success: false,
        }),
        {
          status: 500,
          headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
        }
      );
    }

    logger.info('User unsubscribed from claim invite emails', {
      emailDomain: email.split('@')[1],
      alreadyUnsubscribed: result.alreadyExists,
    });

    return new NextResponse(
      renderHtmlPage({
        title: 'Unsubscribed',
        message:
          "You've been unsubscribed from claim invite emails. You won't receive any more invitations from us.",
        success: true,
      }),
      {
        status: 200,
        headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
      }
    );
  } catch (error) {
    logger.error('Error processing unsubscribe request', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new NextResponse(
      renderHtmlPage({
        title: 'Error',
        message: 'Something went wrong. Please try again later.',
        success: false,
      }),
      {
        status: 500,
        headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/html' },
      }
    );
  }
}

/**
 * Escape special HTML characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a simple HTML page for unsubscribe flow.
 */
function renderHtmlPage(options: {
  title: string;
  message: string;
  success: boolean;
  showForm?: boolean;
  token?: string;
}): string {
  const { title, message, success, showForm, token } = options;

  const iconColor = success ? '#22c55e' : '#ef4444';
  const icon = success
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

  // Escape user-provided values to prevent XSS
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeToken = token ? escapeHtml(token) : '';

  const formHtml = showForm
    ? `
    <form method="POST" style="margin-top: 24px;">
      <input type="hidden" name="token" value="${safeToken}" />
      <button type="submit" style="padding: 12px 24px; background-color: #000; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">
        Unsubscribe
      </button>
    </form>
  `
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Jovie</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: #fff;
      padding: 48px;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      text-align: center;
      max-width: 400px;
      margin: 24px;
    }
    h1 {
      margin: 16px 0 8px;
      font-size: 24px;
      font-weight: 600;
      color: #000;
    }
    p {
      margin: 0;
      color: #555;
      line-height: 1.6;
    }
    button:hover {
      background-color: #333 !important;
    }
  </style>
</head>
<body>
  <div class="container">
    ${icon}
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    ${formHtml}
  </div>
</body>
</html>
`;
}
