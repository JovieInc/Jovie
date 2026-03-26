/**
 * Safe JSON-LD serialization for use inside <script> tags.
 *
 * Standard JSON.stringify can produce strings containing "</script>" or "<!--"
 * from user-controlled data (e.g., bio, display_name), which breaks out of
 * the script tag and enables XSS.
 *
 * This utility replaces dangerous sequences per the HTML spec:
 * - "</" → "\\u003c/" (prevents closing script/style tags)
 * - "<!--" → "\\u003c!--" (prevents HTML comment injection)
 */
export function safeJsonLdStringify(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('</', String.raw`\u003c/`)
    .replaceAll('<!--', String.raw`\u003c!--`);
}
