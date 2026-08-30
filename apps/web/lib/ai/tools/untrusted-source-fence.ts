const UNTRUSTED_SOURCE_PATTERN =
  /^<untrusted-source url="([^"]*)"(?: encoding="(entities-v1)")?>([\s\S]*)<\/untrusted-source>$/;
const RAW_FENCE_TOKEN_PATTERN = /<\s*\/?\s*untrusted-source\b/i;

interface ValidFence {
  readonly encoding: 'entities-v1' | null;
  readonly payload: string;
}

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

function matchValidFence(content: string): ValidFence | null {
  const match = content.match(UNTRUSTED_SOURCE_PATTERN);
  const payload = match?.[3];
  if (payload === undefined || RAW_FENCE_TOKEN_PATTERN.test(payload)) {
    return null;
  }
  return {
    encoding: match?.[2] === 'entities-v1' ? 'entities-v1' : null,
    payload,
  };
}

export function wrapUntrustedSourceContent(
  content: string,
  url: string
): string {
  const escapedUrl = escapeFenceText(url).replaceAll('"', '&quot;');
  const escapedContent = escapeFenceText(content);
  return `<untrusted-source url="${escapedUrl}" encoding="entities-v1">${escapedContent}</untrusted-source>`;
}

export function stripUntrustedSourceFence(content: string): string {
  const match = matchValidFence(content);
  if (!match) return content;
  return match.encoding === 'entities-v1'
    ? unescapeFenceText(match.payload)
    : match.payload;
}

export function isUntrustedSourceFenced(content: string): boolean {
  return matchValidFence(content) !== null;
}

export function isMalformedUntrustedSourceFence(content: string): boolean {
  return (
    RAW_FENCE_TOKEN_PATTERN.test(content) && matchValidFence(content) === null
  );
}
