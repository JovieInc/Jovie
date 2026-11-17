import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingRoundedFrame } from './MarketingRoundedFrame';
import meta, {
  LongContentCaption,
  RtlArabic,
} from './MarketingRoundedFrame.states.stories';

type Props = ComponentProps<typeof MarketingRoundedFrame>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

// Rendered-state and axe coverage; the class contract lives in
// MarketingRoundedFrame.test.tsx.
describe('MarketingRoundedFrame states', () => {
  it('keeps a long caption whole inside the frame', async () => {
    const { container } = render(
      <MarketingRoundedFrame {...props(LongContentCaption)} />
    );
    const figure = screen.getByRole('figure', { name: 'Profile preview' });
    expect(figure.parentElement).toHaveClass('marketing-rounded-frame', 'w-72');
    expect(figure).toHaveTextContent(
      'from the first release to the show they buy tickets for after it.'
    );
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic caption in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingRoundedFrame {...props(RtlArabic)} />
      </div>
    );
    expect(
      screen.getByRole('figure', { name: 'معاينة الملف' })
    ).toHaveTextContent('اتصال مباشر مع كل مستمع.');
    await expectNoA11yViolations(container);
  });
});
