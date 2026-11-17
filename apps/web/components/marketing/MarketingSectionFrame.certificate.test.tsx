import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingSectionFrame } from './MarketingSectionFrame';
import {
  LongContentCopy,
  PartialNoEyebrow,
  RtlArabic,
} from './MarketingSectionFrame.states.stories';

// Rendered-state and axe coverage; the layout contract lives in
// MarketingSectionFrame.test.tsx.
describe('MarketingSectionFrame states', () => {
  it('renders the partial frame with no eyebrow', async () => {
    const { container } = render(
      <MarketingSectionFrame {...PartialNoEyebrow.args} />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Your release work, connected.',
      })
    ).toBeInTheDocument();
    expect(container.querySelector('.homepage-section-eyebrow')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long eyebrow and copy whole', async () => {
    const { container } = render(
      <MarketingSectionFrame {...LongContentCopy.args} />
    );
    expect(
      screen.getByText(
        'Inside Jovie, for every release, profile and fan signal'
      )
    ).toHaveClass('homepage-section-eyebrow');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'connected in one shared view.'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a reversed Arabic frame in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingSectionFrame {...RtlArabic.args} />
      </div>
    );
    expect(screen.getByText('داخل جوفي').parentElement).toHaveClass(
      'md:text-right'
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'عملك على الإصدار، متصل.' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
