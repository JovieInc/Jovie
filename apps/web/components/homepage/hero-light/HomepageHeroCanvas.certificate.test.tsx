import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageHeroCanvas } from './HomepageHeroCanvas';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/components/features/home/claim-handle/useHandleValidation', () => ({
  useHandleValidation: () => ({
    handleError: null,
    checkingAvail: false,
    available: true,
    availError: null,
  }),
}));

const hero = HOMEPAGE_COPY.hero;
const OWNER = 'apps/web/components/homepage/HomepageArtistProfile.tsx';

describe('HomepageHeroCanvas certificate', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the hero with its proof capture axe-clean', async () => {
    const { container } = render(
      <HomepageHeroCanvas
        headingId='home-hero-heading'
        headline={hero.headline}
        subhead={hero.subhead}
        claim={hero.claim}
        supportNote={hero.supportNote}
        profile={hero.profile}
        sectionOwner={OWNER}
      />
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(hero.headline);
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'aria-labelledby',
      'home-hero-heading'
    );
    expect(screen.getByTestId('homepage-hero-proof')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a typed handle and hands it to /start on Claim', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HomepageHeroCanvas
        headingId='home-hero-heading'
        headline={hero.headline}
        subhead={hero.subhead}
        claim={hero.claim}
        supportNote={hero.supportNote}
        sectionOwner={OWNER}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Choose Your Handle' });

    await user.type(input, 'nightdrive');
    expect(input).toHaveValue('nightdrive');
    expect(screen.queryByTestId('homepage-hero-proof')).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByTestId('homepage-primary-cta'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0]?.[0]).toContain('nightdrive');
  });

  it('keeps long and right-to-left copy as one accessible headline', async () => {
    const headline = 'كن معروفًا. كن مفهومًا لكل من يجد موسيقاك.';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageHeroCanvas
          headingId='rtl-hero-heading'
          headline={headline as typeof hero.headline}
          subhead={
            'صفحة مجانية لموسيقاك وسيرتك وروابطك.' as typeof hero.subhead
          }
          claim={hero.claim}
          supportNote={hero.supportNote}
          sectionOwner={OWNER}
        />
      </div>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      headline
    );
    await expectNoA11yViolations(container);
  });
});
