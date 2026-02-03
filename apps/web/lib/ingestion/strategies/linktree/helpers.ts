/**
 * Linktree Extraction Helpers
 *
 * Helper functions for extracting data from Linktree pages.
 */

/**
 * Linktree Next.js page props structure.
 */
export type LinktreePageProps = {
  readonly props?: {
    readonly pageProps?: {
      readonly seo?: { title?: string | null; image?: string | null };
      readonly links?: unknown;
      readonly allLinks?: unknown;
      readonly user?: {
        readonly fullName?: string | null;
        readonly profilePicture?: { url?: string | null } | null;
      };
      readonly account?: {
        displayName?: string | null;
        profilePicture?: string | null;
      };
      readonly page?: { links?: unknown };
      readonly data?: { links?: unknown };
      readonly profile?: { links?: unknown };
      readonly linkData?: unknown;
      readonly dehydratedState?: { queries?: unknown };
    };
  };
  readonly query?: { handle?: string };
};

export type StructuredLink = { url?: string | null; title?: string | null };

/**
 * Sanitize and validate an avatar URL.
 */
export function sanitizeAvatarUrl(
  candidate: string | null | undefined
): string | null {
  if (!candidate) return null;
  try {
    const parsed = new URL(
      candidate.startsWith('http') ? candidate : `https://${candidate}`
    );
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Extract structured links from Linktree Next.js data.
 */
export function extractStructuredLinks(
  nextData: LinktreePageProps | null
): StructuredLink[] {
  if (!nextData?.props?.pageProps) {
    return [];
  }

  const structured: StructuredLink[] = [];
  const pageProps = nextData.props.pageProps;

  const candidateCollections: unknown[] = [
    pageProps.links,
    pageProps.allLinks,
    (pageProps as { page?: { links?: unknown } }).page?.links,
    (pageProps as { data?: { links?: unknown } }).data?.links,
    (pageProps as { profile?: { links?: unknown } }).profile?.links,
    (pageProps as { linkData?: unknown }).linkData,
  ];

  const dehydratedQueries = (
    pageProps as { dehydratedState?: { queries?: unknown } }
  ).dehydratedState?.queries;
  if (Array.isArray(dehydratedQueries)) {
    for (const query of dehydratedQueries) {
      if (!query || typeof query !== 'object') continue;
      const data = (query as { state?: { data?: unknown } }).state?.data;
      if (data && typeof data === 'object') {
        candidateCollections.push(
          (data as { links?: unknown }).links,
          (data as { page?: { links?: unknown } }).page?.links
        );
      }
    }
  }

  const seen = new Set<string>();

  const collect = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        collect(entry);
      }
      return;
    }

    if (typeof value !== 'object') return;
    const candidate = value as Record<string, unknown>;
    const urlCandidate = (candidate.url ??
      candidate.linkUrl ??
      candidate.href) as string | null | undefined;

    if (typeof urlCandidate === 'string') {
      const key = urlCandidate.trim();
      if (!seen.has(key)) {
        seen.add(key);
        structured.push({
          url: urlCandidate,
          title:
            (candidate.title as string | undefined) ??
            (candidate.name as string | undefined) ??
            (candidate.label as string | undefined) ??
            (candidate.text as string | undefined),
        });
      }
    }

    if (candidate.links) collect(candidate.links);
    if (candidate.items) collect(candidate.items);
    if (candidate.children) collect(candidate.children);
    if (candidate.buttons) collect(candidate.buttons);
  };

  for (const collection of candidateCollections) {
    collect(collection);
  }

  return structured;
}
