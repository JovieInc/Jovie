const UNTRUSTED_SOURCE_PATTERN =
  /^<untrusted-source url="([^"]*)">([\s\S]*)<\/untrusted-source>$/;
const RAW_FENCE_TOKEN_PATTERN = /<\s*\/?\s*untrusted-source\b/i;

function escapeFenceText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function unescapeFenceText(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function matchValidFence(content: string): RegExpMatchArray | null {
  const match = content.match(UNTRUSTED_SOURCE_PATTERN);
  const payload = match?.[2];
  if (payload === undefined || RAW_FENCE_TOKEN_PATTERN.test(payload)) {
    return null;
  }
  return match;
}

export function wrapUntrustedSourceContent(
  content: string,
  url: string
): string {
  const escapedUrl = escapeFenceText(url).replaceAll('"', '&quot;');
  const escapedContent = escapeFenceText(content);
  return `<untrusted-source url="${escapedUrl}">${escapedContent}</untrusted-source>`;
}

export function stripUntrustedSourceFence(content: string): string {
  const match = matchValidFence(content);
  return match?.[2] === undefined ? content : unescapeFenceText(match[2]);
}

export function isUntrustedSourceFenced(content: string): boolean {
  return matchValidFence(content) !== null;
}
