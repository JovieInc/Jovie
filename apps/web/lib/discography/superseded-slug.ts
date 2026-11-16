/**
 * Resolve a superseded base slug to the artist's one published release.
 *
 * Import-time collisions suffix later releases (`take-me-over` becomes
 * `take-me-over-2`) while links already published elsewhere keep the base
 * slug. Identity cannot be known generically, so this is deliberately
 * conservative. It returns a slug only when ALL hold:
 *  - no non-deleted release of the creator owns `baseSlug` (a placeholder or
 *    draft owner means the slug is claimed; never shadow it);
 *  - exactly ONE publish-eligible release has slug `{baseSlug}-N`, or holds a
 *    redirect row renaming a `{baseSlug}-N` slug (a `-N` sibling that was
 *    itself renamed again — `take-me-over-2` -> `take-me-over-with-tim-white`
 *    — keeps its chain alive through the row `renameReleaseSlug` wrote);
 *  - that release's title normalizes to exactly `baseSlug` (so remixes and
 *    differently-titled versions never match).
 * Two or more candidates are ambiguous (could be different recordings), so no
 * redirect is made.
 */
import { and, eq, inArray, isNotNull, isNull, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentSlugRedirects, discogReleases } from '@/lib/db/schema/content';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { generateBaseSlug } from './slug-policy';

export async function findSupersededReleaseSlug(
  creatorProfileId: string,
  baseSlug: string
): Promise<{ readonly currentSlug: string } | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(baseSlug)) return null;

  const [owner, siblings, aliases] = await Promise.all([
    db
      .select({ id: discogReleases.id })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          eq(discogReleases.slug, baseSlug),
          isNull(discogReleases.deletedAt)
        )
      )
      .limit(1),
    db
      .select({
        id: discogReleases.id,
        slug: discogReleases.slug,
        title: discogReleases.title,
      })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          like(discogReleases.slug, `${baseSlug}-%`),
          publicReleaseEligibilitySqlPredicate()
        )
      )
      .limit(20),
    db
      .select({
        releaseId: contentSlugRedirects.releaseId,
        oldSlug: contentSlugRedirects.oldSlug,
      })
      .from(contentSlugRedirects)
      .where(
        and(
          eq(contentSlugRedirects.creatorProfileId, creatorProfileId),
          eq(contentSlugRedirects.contentType, 'release'),
          like(contentSlugRedirects.oldSlug, `${baseSlug}-%`),
          isNotNull(contentSlugRedirects.releaseId)
        )
      )
      .limit(20),
  ]);
  if (owner.length > 0) return null;

  const suffixed = new RegExp(`^${baseSlug}-\\d+$`);
  const renamed = new Set(
    aliases
      .filter(
        (row): row is { releaseId: string; oldSlug: string } =>
          row.releaseId !== null && suffixed.test(row.oldSlug)
      )
      .map(row => row.releaseId)
  );

  // A renamed `-N` sibling whose current slug no longer starts with the base
  // is not in `siblings`; fetch it (eligibility applies) before filtering.
  const known = new Set(siblings.map(row => row.id));
  const missing = [...renamed].filter(id => !known.has(id));
  const viaAlias = missing.length
    ? await db
        .select({
          id: discogReleases.id,
          slug: discogReleases.slug,
          title: discogReleases.title,
        })
        .from(discogReleases)
        .where(
          and(
            inArray(discogReleases.id, missing),
            publicReleaseEligibilitySqlPredicate()
          )
        )
        .limit(20)
    : [];

  const candidates = [...siblings, ...viaAlias].filter(
    row =>
      generateBaseSlug(row.title) === baseSlug &&
      (suffixed.test(row.slug) || renamed.has(row.id))
  );
  const [only] = candidates;
  return candidates.length === 1 && only ? { currentSlug: only.slug } : null;
}
