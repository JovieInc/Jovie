import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PublicProfileNotFound from '@/app/[username]/not-found';

const ROUTE_CONTRACTS = [
  {
    registryId: 'web-044-[username]--[---slug]',
    source: 'app/[username]/[...slug]/page.tsx',
    storyExport: 'Web044MissingProfileAlias',
  },
  {
    registryId: 'web-049-[username]--about',
    source: 'app/[username]/about/page.tsx',
    storyExport: 'Web049MissingProfileAbout',
  },
  {
    registryId: 'web-050-[username]--alerts',
    source: 'app/[username]/alerts/page.tsx',
    storyExport: 'Web050MissingProfileAlerts',
  },
  {
    registryId: 'web-051-[username]--contact',
    source: 'app/[username]/contact/page.tsx',
    storyExport: 'Web051MissingProfileContact',
  },
  {
    registryId: 'web-052-[username]--merch--[cardId]',
    source: 'app/[username]/merch/[cardId]/page.tsx',
    storyExport: 'Web052MissingMerchCard',
  },
  {
    registryId: 'web-054-[username]',
    source: 'app/[username]/page.tsx',
    storyExport: 'Web054MissingPublicProfile',
  },
  {
    registryId: 'web-055-[username]--pay',
    source: 'app/[username]/pay/page.tsx',
    storyExport: 'Web055MissingProfilePay',
  },
  {
    registryId:
      'web-056-[username]--profile-mode-render--[profileMode]--[marker]',
    source:
      'app/[username]/profile-mode-render/[profileMode]/[marker]/page.tsx',
    storyExport: 'Web056MissingProfileModeRender',
  },
  {
    registryId: 'web-057-[username]--shop',
    source: 'app/[username]/shop/page.tsx',
    storyExport: 'Web057MissingProfileShop',
  },
] as const;

describe('public profile missing-state source contract', () => {
  it('renders the exact shared profile-miss boundary', () => {
    render(<PublicProfileNotFound />);

    expect(screen.getByTestId('not-found')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Profile not found' })
    ).toBeVisible();
    expect(screen.getByText("This profile doesn't exist.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(
      screen.getByRole('link', { name: 'Search artists' })
    ).toHaveAttribute('href', '/artist-profiles');
  });

  it('binds each server route only to the inherited missing state', () => {
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/PublicProfileNotFound.stories.tsx'
      ),
      'utf8'
    );

    expect(storySource).toContain(
      "import PublicProfileNotFound from '@/app/[username]/not-found'"
    );
    expect(storySource).not.toContain('FOUNDER_DEMO_PERSONA');
    expect(storySource).not.toContain('profile: {');

    for (const contract of ROUTE_CONTRACTS) {
      const routeSource = readFileSync(
        resolve(process.cwd(), contract.source),
        'utf8'
      );

      expect(routeSource).toContain('notFound()');
      expect(storySource).toContain(contract.registryId);
      expect(storySource).toContain(`'${contract.storyExport}'`);
    }
  });

  it('excludes the redirect-only notifications route from visual coverage', () => {
    const notificationsRoute = readFileSync(
      resolve(process.cwd(), 'app/[username]/notifications/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/PublicProfileNotFound.stories.tsx'
      ),
      'utf8'
    );
    const profileVisualAuditSource = readFileSync(
      resolve(process.cwd(), 'tests/e2e/profile-visual-audit.spec.ts'),
      'utf8'
    );

    expect(notificationsRoute).toContain(
      "redirect(getProfileModeHref(username, 'subscribe'))"
    );
    expect(notificationsRoute).not.toContain('notFound()');
    expect(storySource).not.toContain('web-053-[username]--notifications');
    expect(profileVisualAuditSource).not.toContain("id: 'notifications'");
    expect(profileVisualAuditSource).not.toContain("id: 'notifications-focus'");
    expect(storySource.match(/fixtureState: 'missing'/g)).toHaveLength(1);
    expect(storySource).toContain("proofTier: 'source-backed-missing-state'");
  });
});
