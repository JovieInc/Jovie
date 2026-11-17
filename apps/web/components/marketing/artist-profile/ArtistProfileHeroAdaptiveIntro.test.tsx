import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';
import meta, {
  LongContentCopy,
  PermissionDeniedNoLogoGrant,
  RtlArabic,
} from './ArtistProfileHeroAdaptiveIntro.states.stories';

// No brand has granted a logo yet, so the granted branch borrows the
// story-only fixture grants through the same permission check.
const grants = vi.hoisted(() => ({ fixtures: false }));
vi.mock('@/data/product-truth/logo-permissions', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/data/product-truth/logo-permissions')
    >();
  return {
    ...actual,
    permittedLogoAssetIds: (
      placement: Parameters<typeof actual.permittedLogoAssetIds>[0],
      options: Parameters<typeof actual.permittedLogoAssetIds>[1] = {}
    ) =>
      actual.permittedLogoAssetIds(placement, {
        ...options,
        permissions:
          options.permissions ??
          (grants.fixtures ? LOGO_PERMISSION_FIXTURES : undefined),
      }),
  };
});

const TRUST_LABEL = 'Artist distribution across leading music companies';

describe('ArtistProfileHeroAdaptiveIntro', () => {
  afterEach(() => {
    grants.fixtures = false;
  });

  it('renders the hero and adaptive section with no trust strip when no logo is granted', async () => {
    const { container } = render(
      <ArtistProfileHeroAdaptiveIntro
        {...meta.args}
        {...PermissionDeniedNoLogoGrant.args}
      />
    );
    expect(
      screen.getByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.hero)
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.adaptive)
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: TRUST_LABEL })).toBeNull();
    expect(container.querySelector('.homepage-trust-section')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the trust strip once a brand grants a logo for the page', async () => {
    grants.fixtures = true;
    const { container } = render(
      <ArtistProfileHeroAdaptiveIntro {...meta.args} />
    );
    expect(container.querySelector('.homepage-trust-section')).not.toBeNull();
    expect(
      screen.getByRole('region', { name: TRUST_LABEL })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('switches profile modes inside the mounted adaptive section', async () => {
    const user = userEvent.setup();
    render(<ArtistProfileHeroAdaptiveIntro {...meta.args} />);
    const mode = ARTIST_PROFILE_COPY.adaptive.modes[2];
    const tab = screen.getByRole('tab', { name: mode.label });
    await user.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps long hero copy whole', async () => {
    const { container } = render(
      <ArtistProfileHeroAdaptiveIntro
        {...meta.args}
        {...LongContentCopy.args}
      />
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: LongContentCopy.args?.hero?.headline,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic hero copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileHeroAdaptiveIntro {...meta.args} {...RtlArabic.args} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'ملف فني يتكيف معك.' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
