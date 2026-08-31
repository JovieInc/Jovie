const FENCE_OPEN_PREFIX = '<untrusted-source url="';
const LEGACY_OPEN_SUFFIX = '">';
const VERSIONED_OPEN_SUFFIX = '" encoding="entities-v1">';
const FENCE_CLOSE = '</untrusted-source>';
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
  if (
    !content.startsWith(FENCE_OPEN_PREFIX) ||
    !content.endsWith(FENCE_CLOSE)
  ) {
    return null;
  }

  const afterPrefix = content.slice(FENCE_OPEN_PREFIX.length);
  const versionedUrlEnd = afterPrefix.indexOf(VERSIONED_OPEN_SUFFIX);
  const legacyUrlEnd = afterPrefix.indexOf(LEGACY_OPEN_SUFFIX);
  const hasVersionedSuffix =
    versionedUrlEnd >= 0 &&
    (legacyUrlEnd < 0 || versionedUrlEnd <= legacyUrlEnd);
  const urlEnd = hasVersionedSuffix ? versionedUrlEnd : legacyUrlEnd;

  if (urlEnd < 0 || afterPrefix.slice(0, urlEnd).includes('"')) {
    return null;
  }

  const openLength =
    FENCE_OPEN_PREFIX.length +
    urlEnd +
    (hasVersionedSuffix
      ? VERSIONED_OPEN_SUFFIX.length
      : LEGACY_OPEN_SUFFIX.length);
  const payloadEnd = content.length - FENCE_CLOSE.length;
  if (openLength > payloadEnd) return null;

  const payload = content.slice(openLength, payloadEnd);
  if (RAW_FENCE_TOKEN_PATTERN.test(payload)) return null;

  return {
    encoding: hasVersionedSuffix ? 'entities-v1' : null,
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
