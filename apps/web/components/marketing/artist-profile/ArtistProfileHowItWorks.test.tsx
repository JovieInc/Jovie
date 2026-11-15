import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';
import meta, {
  EmptySteps,
  LongContentSteps,
  RtlArabic,
} from './ArtistProfileHowItWorks.states.stories';

type Props = ComponentProps<typeof ArtistProfileHowItWorks>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

const HOW = ARTIST_PROFILE_COPY.howItWorks;

describe('ArtistProfileHowItWorks', () => {
  it('renders each written step and the three-stage setup window', async () => {
    const { container } = render(<ArtistProfileHowItWorks howItWorks={HOW} />);
    expect(
      screen.getByTestId('marketing-section-how-it-works')
    ).toHaveAttribute('data-marketing-variant', 'split-setup');
    for (const step of HOW.steps)
      expect(
        screen.getByRole('heading', { level: 3, name: step.title })
      ).toBeInTheDocument();
    const window = container.querySelector('figure') as HTMLElement;
    expect(window).toHaveTextContent('Set up your profile');
    expect(within(window).getAllByRole('img')).toHaveLength(3);
    expect(within(window).getByText('Claim')).toBeInTheDocument();
    expect(within(window).getByText('Share')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the header and setup window when there are no written steps', async () => {
    const { container } = render(
      <ArtistProfileHowItWorks {...props(EmptySteps)} />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: HOW.headline })
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(container.querySelector('figure')).toHaveTextContent(
      'Set up your profile'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long step copy whole', async () => {
    const { container } = render(
      <ArtistProfileHowItWorks {...props(LongContentSteps)} />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: props(LongContentSteps).howItWorks.headline,
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/This step carries extra words/)).toHaveLength(
      HOW.steps.length
    );
    await expectNoA11yViolations(container);
  });

  it('renders Arabic steps in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileHowItWorks {...props(RtlArabic)} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'شارك الرابط.' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
