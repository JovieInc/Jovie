import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';
import meta, {
  LongContentHeadline,
  RtlArabic,
} from './ArtistProfileFinalCta.states.stories';

type Props = ComponentProps<typeof ArtistProfileFinalCta>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

const FINAL = ARTIST_PROFILE_COPY.finalCta;

describe('ArtistProfileFinalCta', () => {
  it('points the claim action at the claim intent and reaches it by keyboard', async () => {
    const user = userEvent.setup();
    const intent = getClaimProfileIntent();
    const { container } = render(<ArtistProfileFinalCta finalCta={FINAL} />);
    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      FINAL.headline
    );
    const action = screen.getByTestId('final-cta-action');
    expect(action).toHaveAttribute('href', intent.href);
    expect(action).toHaveAttribute('data-analytics-event', intent.eventName);
    expect(action).toHaveAttribute(
      'data-analytics-source',
      'artist-profiles-final-cta'
    );
    expect(action).toHaveAttribute('data-cta-sign-up', 'true');
    await user.tab();
    expect(action).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('falls back to the claim intent label and honours an href override', () => {
    const intent = getClaimProfileIntent();
    render(
      <ArtistProfileFinalCta
        finalCta={{ ...FINAL, ctaLabel: '' }}
        ctaHref='/start?from=artist-profiles'
      />
    );
    const action = screen.getByRole('link', { name: intent.label });
    expect(action).toHaveAttribute('href', '/start?from=artist-profiles');
  });

  it('keeps a long headline and label whole', async () => {
    const { container } = render(
      <ArtistProfileFinalCta {...props(LongContentHeadline)} />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: props(LongContentHeadline).finalCta.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Claim your free artist profile today' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileFinalCta {...props(RtlArabic)} />
      </div>
    );
    expect(screen.getByRole('link', { name: 'احجز ملفك' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
