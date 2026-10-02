interface PublicWorkLink {
  readonly platform?: string | null;
  readonly url?: string | null;
}

const CONTROL_CHARACTERS = /\p{Cc}/u;
const PLATFORM_LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function publicUrl(value: string | null | undefined): URL | null {
  if (!value || CONTROL_CHARACTERS.test(value)) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Format additional links supplied by the existing public-profile loader. */
export function buildPublicWorkLinkLines(
  links: readonly PublicWorkLink[],
  alreadyListedUrls: readonly (string | null | undefined)[] = []
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const value of alreadyListedUrls) {
    const url = publicUrl(value);
    if (url) seen.add(url.href);
  }

  for (const link of links) {
    const url = publicUrl(link.url);
    if (!url || seen.has(url.href)) continue;

    const platform = link.platform?.trim();
    const label =
      platform && PLATFORM_LABEL.test(platform)
        ? platform.replace(/[_-]+/g, ' ')
        : url.hostname;
    const escapedLabel = label.replace(/[\\[\]`*_<>]/g, '\\$&');
    // Angle brackets preserve URLs containing parentheses in Markdown links.
    lines.push(`- [${escapedLabel}](<${url.href}>)`);
    seen.add(url.href);
  }

  return lines;
}
