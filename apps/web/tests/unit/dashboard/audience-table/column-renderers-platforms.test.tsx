import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderPlatformsCell } from '@/features/dashboard/organisms/dashboard-audience-table/utils/column-renderers';
import type { AudienceMember } from '@/types';

function createMember(): AudienceMember {
  return {
    id: 'member-1',
    type: 'email',
    displayName: 'Taylor',
    locationLabel: 'Austin, TX',
    geoCity: 'Austin',
    geoCountry: 'US',
    visits: 3,
    engagementScore: 50,
    intentLevel: 'high',
    latestActions: [{ label: 'Viewed profile' }],
    referrerHistory: [{ url: 'https://instagram.com/jovie' }],
    utmParams: { source: 'instagram', medium: 'social' },
    email: 'taylor@example.com',
    phone: null,
    spotifyConnected: false,
    purchaseCount: 0,
    tipAmountTotalCents: 250,
    tipCount: 1,
    tags: [],
    deviceType: 'mobile',
    lastSeenAt: new Date().toISOString(),
  };
}

describe('renderPlatformsCell', () => {
  it('renders a compact icon cluster for intent, returning, and source', () => {
    const member = createMember();

    const { container } = render(
      <TooltipProvider>
        <div>
          {renderPlatformsCell({
            row: { original: member },
          } as never)}
        </div>
      </TooltipProvider>
    );

    const iconCluster = container.querySelector(
      '.inline-flex.items-center.gap-1'
    );
    expect(iconCluster).toBeTruthy();

    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBe(3);
  });
});

describe('intent subtitle tokens', () => {
  it('renders intent levels on Ion tokens, never raw emerald or amber', () => {
    const webRoot = resolve(__dirname, '../../../..');
    const source = readFileSync(
      resolve(
        webRoot,
        'components/features/dashboard/organisms/dashboard-audience-table/utils/column-renderers.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/emerald-|amber-|orange-|cyan-/);
    expect(source).toContain('font-caption text-success');
    expect(source).toContain('font-caption text-secondary-token');
  });
});
