/**
 * Decides whether an edge-redirected legacy alias has to return to a smart
 * link. Keep the branches aligned with the catch-all resolver: published and
 * unpublished collisions stay on the original URL, a rename wins before the
 * mode fallback, and a lookup failure must not be reported as "stay".
 */

export interface AliasCollisionCreator {
  readonly id: string;
  readonly usernameNormalized: string;
}

export interface AliasCollisionLookups {
  readonly getCreatorByUsername: (
    username: string
  ) => Promise<AliasCollisionCreator | null>;
  readonly hasContentCandidate: (
    creatorProfileId: string,
    slug: string
  ) => Promise<boolean>;
  readonly getContentBySlug: (
    creatorProfileId: string,
    slug: string
  ) => Promise<unknown>;
  readonly findRedirectByOldSlug: (
    creatorProfileId: string,
    slug: string
  ) => Promise<{ readonly currentSlug: string } | null>;
  readonly getUnpublishedReleasePresence: (
    creatorProfileId: string,
    slug: string
  ) => Promise<unknown>;
}

export type AliasCollisionDecision =
  | { readonly action: 'stay' }
  | { readonly action: 'content' }
  | { readonly action: 'renamed'; readonly location: string };

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function decideLegacyAliasCollision(
  username: string,
  aliasSlug: string,
  lookups: AliasCollisionLookups
): Promise<AliasCollisionDecision> {
  const creator = await lookups.getCreatorByUsername(username.toLowerCase());
  if (!creator) return { action: 'stay' };

  const collisionStatePromise = Promise.all([
    lookups.findRedirectByOldSlug(creator.id, aliasSlug),
    lookups.getUnpublishedReleasePresence(creator.id, aliasSlug),
  ]).then(
    value => ({ ok: true as const, value }),
    (error: unknown) => ({ error, ok: false as const })
  );
  const hasContentCandidate = await lookups.hasContentCandidate(
    creator.id,
    aliasSlug
  );
  const content = hasContentCandidate
    ? await lookups.getContentBySlug(creator.id, aliasSlug)
    : null;
  if (content) return { action: 'content' };

  const collisionState = await collisionStatePromise;
  if (!collisionState.ok) throw collisionState.error;
  const [oldSlugRedirect, unpublished] = collisionState.value;
  if (oldSlugRedirect) {
    const nextSlug = oldSlugRedirect.currentSlug;
    if (
      !SAFE_SEGMENT.test(creator.usernameNormalized) ||
      !SAFE_SEGMENT.test(nextSlug)
    ) {
      throw new Error('Unsafe renamed alias location');
    }
    return {
      action: 'renamed',
      location: `/${creator.usernameNormalized}/${nextSlug}`,
    };
  }

  if (unpublished) return { action: 'content' };
  return { action: 'stay' };
}
