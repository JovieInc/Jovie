import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SmartLinkNotFound from '@/app/[username]/[slug]/not-found';

const ROUTE_CONTRACTS = [
  {
    registryId: 'web-045-[username]--[slug]--[trackSlug]',
    source: 'app/[username]/[slug]/[trackSlug]/page.tsx',
    storyExport: 'Web045MissingTrack',
  },
  {
    registryId: 'web-046-[username]--[slug]--download',
    source: 'app/[username]/[slug]/download/page.tsx',
    storyExport: 'Web046MissingPromoDownload',
  },
  {
    registryId: 'web-047-[username]--[slug]',
    source: 'app/[username]/[slug]/page.tsx',
    storyExport: 'Web047MissingRelease',
  },
  {
    registryId: 'web-048-[username]--[slug]--sounds',
    source: 'app/[username]/[slug]/sounds/page.tsx',
    storyExport: 'Web048MissingSoundsRelease',
  },
] as const;

describe('public smart-link missing-state source contract', () => {
  it('renders the exact shared not-found body', () => {
    render(<SmartLinkNotFound />);

    expect(screen.getByTestId('not-found')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Content Not Found' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'This page may have been removed or the link may be incorrect.'
      )
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('binds each server route only to its shipped missing state', () => {
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/SmartLinkNotFound.stories.tsx'
      ),
      'utf8'
    );

    expect(storySource).toContain(
      "import SmartLinkNotFound from '@/app/[username]/[slug]/not-found'"
    );
    expect(storySource).not.toContain('FOUNDER_DEMO_PERSONA');
    expect(storySource).not.toContain('providerLinks');

    for (const contract of ROUTE_CONTRACTS) {
      const routeSource = readFileSync(
        resolve(process.cwd(), contract.source),
        'utf8'
      );

      expect(routeSource).toContain("from 'next/navigation'");
      expect(routeSource).toContain('notFound()');
      expect(storySource).toContain(contract.registryId);
      expect(storySource).toContain(`storyExport: '${contract.storyExport}'`);
    }
  });

  it('keeps the proof tier explicitly limited to missing entities', () => {
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/SmartLinkNotFound.stories.tsx'
      ),
      'utf8'
    );

    expect(storySource.match(/fixtureState: 'missing'/g)).toHaveLength(4);
    expect(
      storySource.match(/proofTier: 'source-backed-missing-state'/g)
    ).toHaveLength(4);
  });
});
