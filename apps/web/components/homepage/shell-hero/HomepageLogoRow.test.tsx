import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TRUST_LOGO_ASSETS } from '@/components/media/trustLogoAssets';
import type { LogoPermission } from '@/data/product-truth/logo-permissions';
import { HomepageLogoRow } from './HomepageLogoRow';

afterEach(cleanup);

const assetId = TRUST_LOGO_ASSETS[0].id;
const GRANT: LogoPermission = {
  id: 'perm-fixture-home',
  brand: 'Fixture',
  assetId,
  relationship: 'customer',
  grantedBy: 'Fixture Person, Fixture Co',
  grantedAt: '2026-10-01T00:00:00.000Z',
  expiresAt: null,
  evidenceUrl: 'https://example.com/approval',
  scope: { pages: ['/'] },
};

describe('HomepageLogoRow', () => {
  it('renders nothing while the registry holds no grant for /', () => {
    const { container } = render(<HomepageLogoRow />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only logos with an active grant covering /', () => {
    const { container, rerender } = render(
      <HomepageLogoRow fixturePermissions={[GRANT]} />
    );
    expect(container.querySelectorAll('[data-logo-asset]')).toHaveLength(1);
    expect(
      container
        .querySelector('[data-logo-asset]')
        ?.getAttribute('data-logo-asset')
    ).toBe(assetId);

    rerender(
      <HomepageLogoRow
        fixturePermissions={[{ ...GRANT, scope: { pages: ['/pricing'] } }]}
      />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <HomepageLogoRow
        fixturePermissions={[
          { ...GRANT, revokedAt: '2026-10-02T00:00:00.000Z' },
        ]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
