import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';
import meta, {
  LongContentCopy,
  PartialNoPrinciple,
  RtlArabic,
} from './ArtistProfileOpinionatedSection.states.stories';

type Props = ComponentProps<typeof ArtistProfileOpinionatedSection>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

// Rendered-state and axe coverage; capture and wording contracts live in
// ArtistProfileOpinionatedSection.test.tsx.
describe('ArtistProfileOpinionatedSection states', () => {
  it('renders the default split with its principle and caption, axe-clean', async () => {
    const copy = ARTIST_PROFILE_COPY.opinionated;
    const { container } = render(
      <ArtistProfileOpinionatedSection opinionated={copy} />
    );
    expect(screen.getByText(copy.principle)).toBeInTheDocument();
    expect(container.querySelector('figcaption')).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });

  it('drops the principle and caption in the partial record state', async () => {
    const { container } = render(
      <ArtistProfileOpinionatedSection {...props(PartialNoPrinciple)} />
    );
    expect(
      screen.queryByText(ARTIST_PROFILE_COPY.opinionated.principle)
    ).toBeNull();
    expect(container.querySelector('figcaption')).toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      props(PartialNoPrinciple).preview?.alt
    );
    await expectNoA11yViolations(container);
  });

  it('clamps a long headline and keeps the custom caption', async () => {
    const { container } = render(
      <ArtistProfileOpinionatedSection {...props(LongContentCopy)} />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: props(LongContentCopy).opinionated?.headline,
      })
    ).toHaveClass('line-clamp-2');
    expect(container.querySelector('figcaption')).toHaveTextContent(
      props(LongContentCopy).caption ?? ''
    );
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileOpinionatedSection {...props(RtlArabic)} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'إجراء واحد واضح.' })
    ).toBeInTheDocument();
    expect(screen.getByText('المبدأ: إجراء رئيسي واحد.')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
