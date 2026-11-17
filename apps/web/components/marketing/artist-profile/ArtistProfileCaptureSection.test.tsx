import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';
import meta, {
  LongContentEditorial,
  RtlArabic,
} from './ArtistProfileCaptureSection.states.stories';

type Props = ComponentProps<typeof ArtistProfileCaptureSection>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

describe('ArtistProfileCaptureSection', () => {
  it('renders the editorial loop with an illustrative, inert demo', async () => {
    const { container } = render(
      <ArtistProfileCaptureSection
        id='capture'
        capture={ARTIST_PROFILE_COPY.capture}
      />
    );
    const root = screen.getByTestId('marketing-section-capture');
    expect(root).toHaveAttribute('data-marketing-variant', 'product-demo');
    expect(root).toHaveAttribute('id', 'capture');
    expect(root).toHaveClass('ap-capture-loop');
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.capture.headline,
      })
    ).toBeInTheDocument();
    const demo = screen.getByTestId('artist-profile-capture-demo');
    expect(demo).toHaveTextContent('Illustrative opt-in · no message is sent');
    expect(demo.querySelector('input, button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the plain visual card when there is no journey copy', async () => {
    const { capture } = ARTIST_NOTIFICATIONS_COPY;
    const { container } = render(
      <ArtistProfileCaptureSection capture={capture} />
    );
    const root = screen.getByTestId('marketing-section-capture');
    expect(root).toHaveClass('ap-capture-section--visual');
    expect(root).not.toHaveAttribute('id');
    expect(screen.queryByTestId('artist-profile-capture-demo')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: capture.headline })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long editorial copy whole', async () => {
    const { container } = render(
      <ArtistProfileCaptureSection {...props(LongContentEditorial)} />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: props(LongContentEditorial).capture.headline,
      })
    ).toBeInTheDocument();
    expect(container.querySelector('#capture-long')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileCaptureSection {...props(RtlArabic)} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'التقط كل مستمع.' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
