import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingSectionIntro } from './MarketingSectionIntro';
import meta, {
  EmptyBadges,
  LongContentClampedTitle,
  PartialBadgesNoAside,
  RtlArabic,
} from './MarketingSectionIntro.states.stories';

// Rendered-state and axe coverage; the class contract lives in
// MarketingSectionIntro.test.tsx.
describe('MarketingSectionIntro states', () => {
  it('renders no badge row for an empty badge list', async () => {
    const { container } = render(
      <MarketingSectionIntro {...meta.args} {...EmptyBadges.args} />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: meta.args.title })
    ).toBeInTheDocument();
    expect(container.querySelector('.flex-wrap')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders badges without an aside in the partial state', async () => {
    const { container } = render(
      <MarketingSectionIntro {...meta.args} {...PartialBadgesNoAside.args} />
    );
    expect(screen.getByText('Presaves')).toBeInTheDocument();
    expect(screen.getByText('Fan capture')).toBeInTheDocument();
    expect(
      container.querySelector('.homepage-section-intro')?.children
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('clamps a long title while keeping its full accessible name', async () => {
    const { container } = render(
      <MarketingSectionIntro {...meta.args} {...LongContentClampedTitle.args} />
    );
    const title = screen.getByRole('heading', {
      level: 2,
      name: LongContentClampedTitle.args?.title,
    });
    expect(title).toHaveClass('line-clamp-2');
    expect(title).toHaveAttribute('id', 'marketing-section-intro-long');
    expect(screen.getByText('Smart links for every service')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic intro copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingSectionIntro {...meta.args} {...RtlArabic.args} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'عملك على الإصدار، متصل.' })
    ).toBeInTheDocument();
    expect(screen.getByText('الحفظ المسبق')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
