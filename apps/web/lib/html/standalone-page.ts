/**
 * Tokenized standalone HTML pages for API routes that render browser-facing
 * confirmation screens (opt-in, unsubscribe, etc.).
 *
 * Values mirror apps/web/styles/linear-tokens.css light + dark palettes.
 * Dark mode follows prefers-color-scheme so pages look correct outside the
 * Next.js app shell.
 */

import { APP_NAME } from '@/constants/app';
import { escapeHtml } from '@/lib/email/utils';

export type StandalonePageTone = 'neutral' | 'success' | 'error';

export interface RenderStandalonePageOptions {
  title: string;
  message: string;
  tone?: StandalonePageTone;
  /** Append " | Jovie" to the document title. Defaults to true. */
  includeAppNameInTitle?: boolean;
}

const FONT_BODY =
  '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';

const FONT_DISPLAY =
  '"Satoshi", "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const PAGE_STYLES = `
  :root {
    color-scheme: light dark;
    --page-bg: oklch(98.5% 0.002 282);
    --surface-bg: oklch(100% 0 0);
    --text-primary: oklch(12% 0.005 282);
    --text-secondary: oklch(42% 0.012 282);
    --border-subtle: rgba(0, 0, 0, 0.06);
    --shadow-card: 0px 4px 24px rgba(0, 0, 0, 0.08);
    --status-color: var(--text-secondary);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --page-bg: #06070a;
      --surface-bg: #0a0b0e;
      --text-primary: #f7f8f8;
      --text-secondary: #d0d6e0;
      --border-subtle: rgba(255, 255, 255, 0.07);
      --shadow-card: 0px 4px 24px rgba(0, 0, 0, 0.4);
    }
  }

  :root[data-tone='success'] {
    --status-color: #2f9e44;
  }

  :root[data-tone='error'] {
    --status-color: #f3122d;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    min-height: 100%;
  }

  body {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100svh;
    padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 3vw, 1.5rem);
    background: var(--page-bg);
    color: var(--text-primary);
    font-family: ${FONT_BODY};
    font-size: 1rem;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .card {
    width: 100%;
    max-width: 26rem;
    padding: clamp(2rem, 5vw, 3rem);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    background: var(--surface-bg);
    box-shadow: var(--shadow-card);
    text-align: center;
  }

  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 1rem;
    border-radius: 9999px;
    background: color-mix(in oklab, var(--status-color) 14%, transparent);
    color: var(--status-color);
  }

  h1 {
    margin: 0 0 0.75rem;
    font-family: ${FONT_DISPLAY};
    font-size: clamp(1.375rem, 4vw, 1.5rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--text-secondary);
  }
`;

function renderStatusIcon(tone: StandalonePageTone): string {
  if (tone === 'success') {
    return `<div class="status" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="m9 12 2 2 4-4"></path>
      </svg>
    </div>`;
  }

  if (tone === 'error') {
    return `<div class="status" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    </div>`;
  }

  return '';
}

/**
 * Render a minimal confirmation page with design-system tokens.
 */
export function renderStandalonePage(
  options: RenderStandalonePageOptions
): string {
  const {
    title,
    message,
    tone = 'neutral',
    includeAppNameInTitle = true,
  } = options;

  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const documentTitle = includeAppNameInTitle
    ? `${safeTitle} | ${escapeHtml(APP_NAME)}`
    : safeTitle;
  const toneAttr = tone === 'neutral' ? '' : ` data-tone="${tone}"`;

  return `<!DOCTYPE html>
<html lang="en"${toneAttr}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>${documentTitle}</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <main class="card">
    ${renderStatusIcon(tone)}
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </main>
</body>
</html>`;
}
