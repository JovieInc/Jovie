import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { MarketingPhoneImage } from './MarketingPhoneImage';

const scenarioId = 'tim-white-profile-live-mobile';

describe('MarketingPhoneImage', () => {
  it('uses the registered capture and dimensions inside the shared rounded frame', () => {
    const capture = getMarketingExportImage(scenarioId);
    render(
      <MarketingPhoneImage scenarioId={scenarioId} className='object-contain' />
    );

    const image = screen.getByRole('img', { name: capture.alt });
    expect(image).toHaveClass('marketing-rounded-frame', 'object-contain');
    expect(image).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent(capture.publicUrl))
    );
    expect(image).toHaveAttribute('width', String(capture.width));
    expect(image).toHaveAttribute('height', String(capture.height));
  });

  it('preserves rounded clipping and accessible overrides for fill images', () => {
    render(
      <MarketingPhoneImage
        scenarioId={scenarioId}
        fill
        sizes='100vw'
        altOverride='Subscribe preview'
      />
    );

    const image = screen.getByRole('img', { name: 'Subscribe preview' });
    expect(image).toHaveClass('marketing-rounded-frame');
    expect(image).toHaveAttribute('data-nimg', 'fill');
    expect(image).toHaveAttribute('sizes', '100vw');
  });
});
