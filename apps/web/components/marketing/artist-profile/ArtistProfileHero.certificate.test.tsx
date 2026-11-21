import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileHero } from './ArtistProfileHero';
import meta, {
  LongContentHeadline,
  RtlArabic,
} from './ArtistProfileHero.states.stories';

type Props = ComponentProps<typeof ArtistProfileHero>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

const { trackHomepageEvent } = vi.hoisted(() => ({
  trackHomepageEvent: vi.fn(),
}));
vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent,
}));
vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    useLinkStatus: () => ({ pending: false }),
    default: forwardRef<
      HTMLAnchorElement,
      ComponentProps<'a'> & { prefetch?: boolean }
    >(function TestLink({ prefetch, ...rest }, ref) {
      return <a {...rest} ref={ref} data-prefetch={String(prefetch)} />;
    }),
  };
});

// Analytics, keyboard and axe coverage; the composition contract lives in
// ArtistProfileHero.test.tsx.
describe('ArtistProfileHero states', () => {
  // Keep jsdom from navigating when a hero link is clicked.
  const stayOnPage = (event: MouseEvent) => event.preventDefault();
  beforeEach(() => {
    trackHomepageEvent.mockClear();
    document.addEventListener('click', stayOnPage);
  });
  afterEach(() => document.removeEventListener('click', stayOnPage));

  it('tracks both hero actions and reaches them by keyboard', async () => {
    const user = userEvent.setup();
    const intent = getClaimProfileIntent();
    const { hero } = ARTIST_PROFILE_COPY;
    const { container } = render(
      <ArtistProfileHero hero={hero} adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );
    const claim = screen.getByRole('link', { name: hero.ctaLabel });
    const adapt = screen.getByRole('link', { name: hero.secondaryCtaLabel });
    expect(claim).toHaveAttribute('href', intent.href);
    expect(claim).toHaveAttribute('data-cta-sign-up', 'true');
    expect(adapt).toHaveAttribute('href', '#adaptive');

    await user.tab();
    expect(claim).toHaveFocus();
    await user.tab();
    expect(adapt).toHaveFocus();

    await user.click(claim);
    expect(trackHomepageEvent).toHaveBeenLastCalledWith(
      intent.eventName,
      undefined
    );
    await user.click(adapt);
    expect(trackHomepageEvent).toHaveBeenLastCalledWith(
      'artist_profiles_adaptive_cta_clicked',
      { source: 'artist-profiles-hero' }
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the full long headline under the two-line clamp', async () => {
    const { container } = render(
      <ArtistProfileHero {...props(LongContentHeadline)} />
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: props(LongContentHeadline).hero.headline,
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('link', { name: 'Claim your free artist profile today' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic hero copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileHero {...props(RtlArabic)} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'ملف فني يتكيف معك.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'احجز ملفك' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
