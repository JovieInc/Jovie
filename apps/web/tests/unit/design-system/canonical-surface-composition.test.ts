import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(__dirname, '../../..');

interface SurfaceCompositionContract {
  readonly id: string;
  readonly sourcePath: string;
  readonly requiredReferences: readonly string[];
}

const SURFACE_CONTRACTS: readonly SurfaceCompositionContract[] = [
  {
    id: 'homepage',
    sourcePath: 'app/(home)/page.tsx',
    requiredReferences: [
      "from '@/components/homepage/HomepageHeroCommandCenter'",
      "from '@/components/marketing'",
    ],
  },
  {
    id: 'public-profile',
    sourcePath: 'app/[username]/page.tsx',
    requiredReferences: ["from '@/features/profile/StaticArtistPage'"],
  },
  {
    id: 'release-landing',
    sourcePath: 'app/r/[slug]/ReleaseLandingPage.tsx',
    requiredReferences: ["from '@/features/release/SmartLinkShell'"],
  },
  {
    id: 'dashboard-releases',
    sourcePath: 'app/app/(shell)/dashboard/releases/page.tsx',
    requiredReferences: ["from '../../releases/ReleasesRoute'"],
  },
] as const;

function findCompositionDrift(
  source: string,
  contract: SurfaceCompositionContract
): string[] {
  const missingReferences = contract.requiredReferences
    .filter(reference => !source.includes(reference))
    .map(reference => `missing canonical reference: ${reference}`);
  const routeLocalTokenFork =
    /(?:import\s+['"]|from\s+['"])[^'"]*(?:tokens?|theme)\.(?:css|ts|tsx)['"]/u.test(
      source
    )
      ? ['route-local token or theme fork']
      : [];

  return [...missingReferences, ...routeLocalTokenFork];
}

describe('canonical surface composition', () => {
  it.each(
    SURFACE_CONTRACTS
  )('$id composes its canonical owner without a route-local token fork', contract => {
    const source = readFileSync(resolve(WEB_ROOT, contract.sourcePath), 'utf8');

    expect(findCompositionDrift(source, contract)).toEqual([]);
  });

  it('fails closed when a canonical route introduces detached tokens', () => {
    const contract = SURFACE_CONTRACTS[0];
    const deliberateDrift = `${contract.requiredReferences.join('\n')}\nimport './homepage.tokens.css';`;

    expect(findCompositionDrift(deliberateDrift, contract)).toContain(
      'route-local token or theme fork'
    );
  });

  it('fails closed when a route stops consuming its canonical organism', () => {
    const contract = SURFACE_CONTRACTS[2];

    expect(
      findCompositionDrift('export default function Page() {}', contract)
    ).toContain(
      "missing canonical reference: from '@/features/release/SmartLinkShell'"
    );
  });
});
