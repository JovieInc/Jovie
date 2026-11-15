import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SECTION_TEST_IDS } from '@/data/artistNotificationsPageOrder';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistNotificationsLanding } from './ArtistNotificationsLanding';
import {
  LongContentHero,
  RtlArabic,
} from './ArtistNotificationsLanding.states.stories';

// next/image with `priority` asks React DOM to preload by a srcset selector
// longer than jsdom's selector limit; image loading is not under test here.
vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    unoptimized: _unoptimized,
    loader: _loader,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => (
    <img {...props} alt={typeof props.alt === 'string' ? props.alt : ''} />
  ),
}));

function sectionWrapper(): HTMLElement {
  const hero = screen.getByTestId(ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.hero);
  const wrapper = hero.parentElement;
  if (!wrapper) throw new Error('hero has no wrapper');
  return wrapper;
}

describe('ArtistNotificationsLanding', () => {
  it('renders every section in order on the semantic page canvas', async () => {
    const { container } = render(
      <ArtistNotificationsLanding copy={ARTIST_NOTIFICATIONS_COPY} />
    );

    const wrapper = sectionWrapper();
    expect(wrapper).toHaveClass('bg-base', 'text-primary-token');
    expect(wrapper.className).not.toMatch(/\bbg-black\b/);
    const order = [...wrapper.children].map(child =>
      child.getAttribute('data-testid')
    );
    expect(order).toEqual([
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.hero,
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.trust,
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.capture,
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.reactivation,
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.benefits,
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.specWall,
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.faq,
      ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.finalCta,
    ]);
    expect(container.querySelector('#how-it-works')).toBe(
      screen.getByTestId(ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.reactivation)
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long hero headline whole', async () => {
    const copy = LongContentHero.args?.copy ?? ARTIST_NOTIFICATIONS_COPY;
    const { container } = render(<ArtistNotificationsLanding copy={copy} />);

    const heading = screen.getByRole('heading', { level: 1 });
    for (const line of copy.hero.headlineLines ?? []) {
      if (line) expect(heading).toHaveTextContent(line);
    }
    await expectNoA11yViolations(container);
  });

  it('renders Arabic hero copy in a right-to-left document', async () => {
    const copy = RtlArabic.args?.copy ?? ARTIST_NOTIFICATIONS_COPY;
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistNotificationsLanding copy={copy} />
      </div>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'تواصل مع المستمعين.'
    );
    await expectNoA11yViolations(container);
  });
});
