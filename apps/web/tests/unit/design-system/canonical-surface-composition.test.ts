import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(__dirname, '../../..');

interface SurfaceCompositionContract {
  readonly id: string;
  readonly sourcePath: string;
  readonly requiredBindings: readonly {
    readonly modulePath: string;
    readonly identifier: string;
  }[];
}

const SURFACE_CONTRACTS: readonly SurfaceCompositionContract[] = [
  {
    id: 'homepage',
    sourcePath: 'app/(home)/page.tsx',
    requiredBindings: [
      {
        modulePath: '@/components/homepage/HomepageHeroCommandCenter',
        identifier: 'HomepageHeroCommandCenter',
      },
      {
        modulePath: '@/components/marketing',
        identifier: 'MarketingPosterHero',
      },
    ],
  },
  {
    id: 'public-profile',
    sourcePath: 'app/[username]/page.tsx',
    requiredBindings: [
      {
        modulePath: '@/features/profile/StaticArtistPage',
        identifier: 'StaticArtistPage',
      },
    ],
  },
  {
    id: 'release-landing',
    sourcePath: 'app/r/[slug]/ReleaseLandingPage.tsx',
    requiredBindings: [
      {
        modulePath: '@/features/release/SmartLinkShell',
        identifier: 'SmartLinkShell',
      },
    ],
  },
  {
    id: 'dashboard-releases',
    sourcePath: 'app/app/(shell)/dashboard/releases/page.tsx',
    requiredBindings: [
      {
        modulePath: '../../releases/ReleasesRoute',
        identifier: 'ReleasesRoute',
      },
    ],
  },
] as const;

function findCompositionDrift(
  source: string,
  contract: SurfaceCompositionContract
): string[] {
  const executableSource = source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/.*$/gmu, '');
  const missingReferences = contract.requiredBindings.flatMap(binding => {
    const escapedModulePath = binding.modulePath.replace(
      /[.*+?^${}()|[\]\\]/gu,
      '\\$&'
    );
    const importPattern = new RegExp(
      `import[\\s\\S]*?\\b${binding.identifier}\\b[\\s\\S]*?from ['"]${escapedModulePath}['"]`,
      'u'
    );
    const usagePattern = new RegExp(
      `<${binding.identifier}\\b|\\b${binding.identifier}\\s*\\(`,
      'u'
    );

    return importPattern.test(executableSource) &&
      usagePattern.test(executableSource)
      ? []
      : [
          `missing canonical binding: ${binding.identifier} from ${binding.modulePath}`,
        ];
  });
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
    const deliberateDrift = `import './homepage.tokens.css';`;

    expect(findCompositionDrift(deliberateDrift, contract)).toContain(
      'route-local token or theme fork'
    );
  });

  it('fails closed when a route stops consuming its canonical organism', () => {
    const contract = SURFACE_CONTRACTS[2];

    expect(
      findCompositionDrift('export default function Page() {}', contract)
    ).toContain(
      'missing canonical binding: SmartLinkShell from @/features/release/SmartLinkShell'
    );
  });

  it('rejects a commented or unused canonical import (deliberate red)', () => {
    const contract = SURFACE_CONTRACTS[3];
    const deliberateDrift = `
      // import { ReleasesRoute } from '../../releases/ReleasesRoute';
      import { ReleasesRoute } from '../../releases/ReleasesRoute';
      export default function ReleasesPage() { return null; }
    `;

    expect(findCompositionDrift(deliberateDrift, contract)).toContain(
      'missing canonical binding: ReleasesRoute from ../../releases/ReleasesRoute'
    );
  });
});
