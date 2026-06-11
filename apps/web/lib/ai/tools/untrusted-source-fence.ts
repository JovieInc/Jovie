const UNTRUSTED_SOURCE_PATTERN =
  /^<untrusted-source url="([^"]*)">([\s\S]*)<\/untrusted-source>$/;

export function wrapUntrustedSourceContent(
  content: string,
  url: string
): string {
  const escapedUrl = url.replaceAll('"', '&quot;');
  return `<untrusted-source url="${escapedUrl}">${content}</untrusted-source>`;
}

export function stripUntrustedSourceFence(content: string): string {
  const match = content.match(UNTRUSTED_SOURCE_PATTERN);
  return match?.[2] ?? content;
}

export function isUntrustedSourceFenced(content: string): boolean {
  return UNTRUSTED_SOURCE_PATTERN.test(content);
}
