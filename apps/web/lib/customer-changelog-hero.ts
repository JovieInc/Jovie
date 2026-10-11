/** The existing version-post hero authority; consumers inherit, never select. */
const CHANGELOG_POST_HERO = {
  kind: 'image',
  src: '/images/hero/changelog-version.webp',
  alt: '',
  objectFit: 'cover',
  objectPosition: 'center',
} as const;

export type CustomerChangelogHero = Readonly<
  { postId: string } & typeof CHANGELOG_POST_HERO
>;

/** Call only for a known published release (the post route already resolves it). */
export function resolveCustomerChangelogHero(
  postId: string
): CustomerChangelogHero {
  return { postId, ...CHANGELOG_POST_HERO };
}

export function isCustomerChangelogPostUrl(
  url: string,
  postId: string
): boolean {
  try {
    const parsed = new URL(url);
    return (
      ['https:', 'http:'].includes(parsed.protocol) &&
      parsed.pathname === `/changelog/${encodeURIComponent(postId)}` &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

/** Untrusted/legacy media must not erase the update or invent a replacement. */
export function parseCustomerChangelogHero(
  value: unknown,
  postId: string
): CustomerChangelogHero | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const hero = value as Record<string, unknown>;
  if (!postId || hero.postId !== postId) return null;
  const expected = resolveCustomerChangelogHero(postId);
  return Object.entries(expected).every(
    ([key, expectedValue]) => hero[key] === expectedValue
  )
    ? expected
    : null;
}
