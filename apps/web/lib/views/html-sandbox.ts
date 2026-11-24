/**
 * Wraps an untrusted view `html` block in a document that cannot reach the
 * network. The block renders in `<iframe sandbox="" srcDoc>` (no scripts, no
 * same-origin, no forms, no popups, no top navigation). The sandbox does not
 * stop subresource loads, so on its own a block could still fetch images,
 * stylesheets or fonts from any host the page CSP allows, including Jovie's
 * own origin, which leaks the viewer's IP and can fire GET requests.
 *
 * The inner policy below closes that: only inline styles and data: or blob:
 * images, fonts and media load. A meta CSP can only add restrictions, so
 * nothing the block itself writes can loosen it, and the page CSP still
 * applies on top (a srcdoc document inherits it).
 */
export const VIEW_HTML_BLOCK_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** `<meta http-equiv="refresh">` would navigate the frame without a click. */
export const META_REFRESH_PATTERN =
  /<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh/i;

export function buildSandboxedHtmlDocument(html: string): string {
  return [
    '<!doctype html>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${VIEW_HTML_BLOCK_CSP}">`,
    '<meta name="referrer" content="no-referrer">',
    html,
  ].join('');
}
