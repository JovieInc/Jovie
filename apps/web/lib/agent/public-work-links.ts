interface PublicWorkLink {
  readonly platform?: string | null;
  readonly url?: string | null;
}

const CONTROL_CHARACTERS = /\p{Cc}/u;
const PLATFORM_LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Format additional links supplied by the existing public-profile loader. */
export function buildPublicWorkLinkLines(
  links: readonly PublicWorkLink[]
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    if (!link.url || CONTROL_CHARACTERS.test(link.url)) continue;

    let url: URL;
    try {
      url = new URL(link.url.trim());
    } catch {
      continue;
    }
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      seen.has(url.href)
    ) {
      continue;
    }

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
