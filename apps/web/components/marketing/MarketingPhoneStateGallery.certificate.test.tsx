import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingPhoneStateGallery } from './MarketingPhoneStateGallery';
import meta, {
  EmptyGallery,
  LongContentCaptions,
  PartialCaptionOnly,
  RtlArabic,
} from './MarketingPhoneStateGallery.states.stories';
import defaultMeta, { ThreeStates } from './MarketingPhoneStateGallery.stories';

// Rendered-state, keyboard and axe coverage; the registry contract lives in
// MarketingPhoneStateGallery.test.tsx.
describe('MarketingPhoneStateGallery states', () => {
  it('lets keyboard users focus the scrollable rail', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarketingPhoneStateGallery {...defaultMeta.args} {...ThreeStates.args} />
    );
    const region = screen.getByRole('region', { name: 'Profile states' });
    await user.tab();
    expect(region).toHaveFocus();
    expect(within(region).getAllByRole('figure')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('renders an empty named region with no figures', async () => {
    const { container } = render(
      <MarketingPhoneStateGallery {...meta.args} {...EmptyGallery.args} />
    );
    const region = screen.getByRole('region', { name: 'Profile states' });
    expect(region.closest('[data-count]')).toHaveAttribute('data-count', '0');
    expect(within(region).queryAllByRole('figure')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('mixes a capture with a caption-only state in the partial gallery', async () => {
    const { container } = render(
      <MarketingPhoneStateGallery {...meta.args} {...PartialCaptionOnly.args} />
    );
    const figures = screen.getAllByRole('figure');
    expect(within(figures[0]).getByRole('img')).toHaveAccessibleName(
      'Profile showing the music catalog.'
    );
    expect(within(figures[1]).queryByRole('img')).toBeNull();
    expect(figures[1]).toHaveTextContent('Stay Close');
    await expectNoA11yViolations(container);
  });

  it('keeps every long caption whole', async () => {
    const { container } = render(
      <MarketingPhoneStateGallery
        {...meta.args}
        {...LongContentCaptions.args}
      />
    );
    const figures = screen.getAllByRole('figure');
    expect(figures).toHaveLength(4);
    expect(figures[3]).toHaveTextContent(
      'A deliberately long state title number 4 that wraps'
    );
    await expectNoA11yViolations(container);
  });

  it('names the Arabic gallery in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingPhoneStateGallery {...meta.args} {...RtlArabic.args} />
      </div>
    );
    expect(
      screen.getByRole('region', { name: 'حالات الملف' })
    ).toHaveTextContent('استمع');
    await expectNoA11yViolations(container);
  });
});
