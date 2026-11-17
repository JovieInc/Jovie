import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistNotificationsBenefitsSection } from './ArtistNotificationsBenefitsSection';
import meta, {
  EmptyBenefits,
  LongContentBenefits,
  RtlArabic,
} from './ArtistNotificationsBenefitsSection.states.stories';

type Props = ComponentProps<typeof ArtistNotificationsBenefitsSection>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

// Rendered-state and axe coverage; the section stamp lives in
// ArtistNotificationsBenefitsSection.test.tsx.
describe('ArtistNotificationsBenefitsSection states', () => {
  it('renders one headed card per benefit, axe-clean', async () => {
    const { benefits } = ARTIST_NOTIFICATIONS_COPY;
    const { container } = render(
      <ArtistNotificationsBenefitsSection benefits={benefits} />
    );
    for (const item of benefits.items)
      expect(
        screen.getByRole('heading', { level: 3, name: item.title })
      ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the header and renders no cards when there are no benefits', async () => {
    const { container } = render(
      <ArtistNotificationsBenefitsSection
        benefits={props(EmptyBenefits).benefits}
      />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_NOTIFICATIONS_COPY.benefits.headline,
      })
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('keeps long benefit copy whole', async () => {
    const { container } = render(
      <ArtistNotificationsBenefitsSection
        benefits={props(LongContentBenefits).benefits}
      />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'A deliberately long benefit title number 3 that wraps',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic benefits in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistNotificationsBenefitsSection
          benefits={props(RtlArabic).benefits}
        />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'حفلات قريبة' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
