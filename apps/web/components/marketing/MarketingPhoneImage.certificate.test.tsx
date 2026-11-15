import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingPhoneImage } from './MarketingPhoneImage';
import meta, { Fill } from './MarketingPhoneImage.stories';

// Axe coverage for both render paths; the registry contract lives in
// MarketingPhoneImage.test.tsx.
describe('MarketingPhoneImage a11y', () => {
  it('names the sized capture with its registry alt text', async () => {
    const capture = getMarketingExportImage(meta.args.scenarioId);
    const { container } = render(<MarketingPhoneImage {...meta.args} />);
    const image = screen.getByRole('img', { name: capture.alt });
    expect(image).toHaveAttribute('width', '320');
    expect(image).toHaveAttribute('height', '693');
    await expectNoA11yViolations(container);
  });

  it('keeps an alt override on the fill capture', async () => {
    const { container } = render(
      <div style={{ position: 'relative', width: 240, height: 520 }}>
        <MarketingPhoneImage
          {...meta.args}
          {...Fill.args}
          altOverride='Profile asking a fan to subscribe'
        />
      </div>
    );
    expect(
      screen.getByRole('img', { name: 'Profile asking a fan to subscribe' })
    ).toHaveAttribute('data-nimg', 'fill');
    await expectNoA11yViolations(container);
  });

  it('keeps a decorative empty alt out of the accessibility tree', async () => {
    const { container } = render(
      <MarketingPhoneImage {...meta.args} altOverride='' />
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    await expectNoA11yViolations(container);
  });
});
