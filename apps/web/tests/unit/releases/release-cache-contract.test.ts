import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(__dirname, '../../..');

function readSource(path: string): string {
  return readFileSync(resolve(WEB_ROOT, path), 'utf8');
}

describe('JOV-6272 unified release entity cache contract', () => {
  it('keys the matrix and entity families by userId+profileId only, never the handle', () => {
    const loader = readSource('lib/releases/release-matrix-loader.ts');

    // One key family: (userId, profileId, scope). The handle must never
    // participate — a rename must not fork the cache entry.
    expect(loader).toContain(
      "matrix: ['releases-matrix', userId, profileId] as const"
    );
    expect(loader).toContain(
      "matrixArchived: ['releases-matrix-archived', userId, profileId] as const"
    );
    expect(loader).toContain(
      `entity: (releaseId: string) =>
      ['release-entity', userId, profileId, releaseId] as const`
    );

    // The handle-in-key fork this contract retires (the handle remains a
    // fetch argument for the view model, never a cache-key part).
    expect(loader).not.toContain(
      'profile.userId,\n      profile.profileId,\n      profile.profileHandle,'
    );
  });

  it('builds every release server-cache tag through createReleasesTag, not inline templates', () => {
    const loader = readSource('lib/releases/release-matrix-loader.ts');
    expect(loader).toContain('tags: [createReleasesTag(userId, profile.id)]');
    expect(loader).toContain(
      'tags: [createReleasesTag(profile.userId, profile.profileId)]'
    );
    expect(loader).not.toContain('`releases:${');
  });

  it('bans inline release cache tags repo-side outside the canonical builder', () => {
    const tagBuilder = readSource('lib/cache/tags.ts');
    expect(tagBuilder).toContain('return `releases:${userId}:${profileId}`;');

    // Every production consumer must build the tag via the helper (or the
    // invalidation map). These are the sites that previously carried inline
    // `releases:${...}` templates.
    const consumers = [
      'app/app/(shell)/dashboard/releases/actions.ts',
      'app/api/library/audio/confirm/route.ts',
      'app/api/library/audio/snippet/route.ts',
      'app/onboarding/actions/connect-spotify.ts',
      'lib/chat/route-audio-upload.ts',
      'lib/services/album-art/apply.ts',
    ];
    for (const consumer of consumers) {
      expect(readSource(consumer), consumer).not.toContain('`releases:${');
    }
  });

  it('centralizes release mutation invalidation in one map entry point', () => {
    const map = readSource('lib/cache/releases.ts');
    expect(map).toContain('export function invalidateReleaseCaches(');
    expect(map).toContain(
      "revalidateTag(createReleasesTag(userId, profileId), 'max');"
    );
    expect(map).toContain(
      "revalidateTag(createSmartLinkContentTag(profileId), 'max');"
    );

    // The mutation sites route through the map, not through tag pairs.
    const actions = readSource('app/app/(shell)/dashboard/releases/actions.ts');
    expect(
      actions.match(/invalidateReleaseCaches\(/g)?.length
    ).toBeGreaterThanOrEqual(13);
    expect(actions).not.toContain('createSmartLinkContentTag');
  });

  it('invalidates the unified release family on profile rename (no handle-keyed self-heal)', () => {
    // The key family no longer contains the handle, so a rename cannot
    // self-heal a cached matrix built from the old handle. The profile
    // response finalizer must invalidate the family explicitly.
    const finalizer = readSource('app/api/dashboard/profile/lib/response.ts');
    expect(finalizer).toContain('invalidateReleaseCaches(clerkUserId');
  });

  it('orders the authenticated release list deterministically with an explicit bound', () => {
    const queries = readSource('lib/discography/queries.ts');

    // Full list: deterministic order (date + id tiebreaker) and bounded.
    expect(queries).toContain(
      '.orderBy(asc(discogReleases.releaseDate), asc(discogReleases.id))'
    );
    expect(queries).toContain('.limit(RELEASES_FOR_PROFILE_LIMIT);');
    expect(queries).toContain('const RELEASES_FOR_PROFILE_LIMIT = 500;');

    // Public projection: deterministic tiebreaker at the 200-row cap so
    // tied/null dates cannot produce duplicate or missing page entries.
    expect(queries).toContain(
      `orderBy(
      drizzleSql\`\${discogReleases.releaseDate} DESC NULLS LAST\`,
      desc(discogReleases.id)
    )`
    );
  });
});
