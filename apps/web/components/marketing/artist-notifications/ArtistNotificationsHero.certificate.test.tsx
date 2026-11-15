import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistNotificationsHero } from './ArtistNotificationsHero';
import meta, {
  EmptyCardStage,
  LongContentHeadline,
  RtlArabic,
} from './ArtistNotificationsHero.states.stories';

type Props = ComponentProps<typeof ArtistNotificationsHero>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

// Rendered-state, keyboard and axe coverage; prefetch and dock contracts live
// in ArtistNotificationsHero.test.tsx.
describe('ArtistNotificationsHero states', () => {
  it('reaches the claim action by keyboard and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { hero } = ARTIST_NOTIFICATIONS_COPY;
    const { container } = render(<ArtistNotificationsHero hero={hero} />);
    const action = screen.getByRole('link', { name: hero.primaryCtaLabel });
    await user.tab();
    expect(action).toHaveFocus();
    expect(action).toHaveAttribute('href', hero.primaryCtaHref);
    await expectNoA11yViolations(container);
  });

  it('renders an empty card stage with the copy and action intact', async () => {
    const { container } = render(
      <ArtistNotificationsHero hero={props(EmptyCardStage).hero} />
    );
    expect(
      screen.getByTestId('artist-notifications-card-stage').children
    ).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Reach listeners.'
    );
    await expectNoA11yViolations(container);
  });

  it('falls back to the single long headline when no lines are given', async () => {
    const { container } = render(
      <ArtistNotificationsHero hero={props(LongContentHeadline).hero} />
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: props(LongContentHeadline).hero.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Claim your page and turn on notifications',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic hero lines in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistNotificationsHero hero={props(RtlArabic).hero} />
      </div>
    );
    expect(screen.getByText('تلقائيًا.')).toHaveClass(
      'system-b-artist-notifications-hero-title-line'
    );
    expect(screen.getByRole('link', { name: 'احجز صفحتك' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
