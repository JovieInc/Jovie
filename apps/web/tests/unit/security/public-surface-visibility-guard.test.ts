import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(process.cwd());

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...listSourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry)
    ) {
      results.push(full);
    }
  }
  return results;
}

describe('closed-loop guardrail: public creator visibility & Better Auth ownership', () => {
  const REQUIRED_PUBLIC_VISIBILITY_ENTRYPOINTS = [
    'app/[username]/_lib/public-profile-loader.ts',
    'app/[username]/[slug]/_lib/data.ts',
    'app/[username]/s/[platform]/route.ts',
    'app/api/celebration-card/[username]/route.tsx',
    'app/api/notifications/sms-intents/route.ts',
    'app/r/[slug]/page.tsx',
    'app/r/isrc/[isrc]/route.ts',
    'lib/notifications/domain.ts',
  ] as const;

  it.each(REQUIRED_PUBLIC_VISIBILITY_ENTRYPOINTS)(
    '%s enforces canonical public creator visibility + test-profile hiding',
    relPath => {
      const source = readFileSync(join(WEB_ROOT, relPath), 'utf8');
      const enforcesCanonicalVisibility =
        source.includes('isCreatorRowPubliclyVisible') ||
        source.includes('readPublicCreatorVisibilityByUsername') ||
        source.includes('readPublicCreatorVisibilityById') ||
        (source.includes('isPublicProfilePublished') &&
          source.includes('shouldHideTestProfileFromDirectUrl')) ||
        (source.includes('creatorProfiles.isPublic') &&
          source.includes('shouldHideTestProfileFromDirectUrl'));

      expect(enforcesCanonicalVisibility).toBe(true);
    }
  );

  it('requires smartlink cached reads to verify fresh publication authority before serving', () => {
    const smartlinkData = readFileSync(
      join(WEB_ROOT, 'app/[username]/[slug]/_lib/data.ts'),
      'utf8'
    );
    expect(smartlinkData).toContain('readPublicCreatorVisibilityByUsername');
  });

  it('forbids retired Clerk-ID nullability as a proxy for profile ownership across app/ and components/', () => {
    const files = [
      ...listSourceFiles(join(WEB_ROOT, 'app')),
      ...listSourceFiles(join(WEB_ROOT, 'components')),
    ];
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (
        /\b(?:creatorClerkId|userClerkId)\s*(?:!==|===)\s*null\b/.test(source)
      ) {
        violations.push(relative(WEB_ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('requires public-profile-loader pixel checks to normalize trial expiry via resolveEffectivePlan', () => {
    const loader = readFileSync(
      join(WEB_ROOT, 'app/[username]/_lib/public-profile-loader.ts'),
      'utf8'
    );
    expect(loader).toContain('resolveEffectivePlan(');
    expect(loader).not.toMatch(
      /getCreatorMetaPixelId\(\s*[^,]+,\s*(?:result|authority)\.userPlan/
    );
  });
});
