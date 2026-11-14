import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

const SCENARIO = 'dashboard-releases-sidebar-desktop';
const PHONE_SCENARIO = 'public-profile-mobile';
const SIZES = '100vw';
const image = getMarketingExportImage(SCENARIO);

function frame(scenarioId = SCENARIO) {
  return screen.getByTestId(`product-screenshot-frame-${scenarioId}`);
}

describe('ProductScreenshotFrame', () => {
  it('holds a skeleton in the capture geometry until the image loads', async () => {
    const { container } = render(
      <ProductScreenshotFrame scenarioId={SCENARIO} sizes={SIZES} />
    );

    expect(frame()).toHaveAttribute('data-status', 'loading');
    expect(frame().style.aspectRatio).toBe(`${image.width} / ${image.height}`);
    expect(container.querySelector('.psf__skeleton')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);

    // next/image reports onLoad after its decode promise settles.
    fireEvent.load(screen.getByRole('img', { name: image.alt }));
    await waitFor(() =>
      expect(frame()).toHaveAttribute('data-status', 'loaded')
    );
    expect(container.querySelector('.psf__skeleton')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('swaps a failed capture for a named fallback in the same frame', async () => {
    const { container } = render(
      <ProductScreenshotFrame
        scenarioId={SCENARIO}
        sizes={SIZES}
        variant='dark-glass'
        focus={{
          label: 'Release sidebar',
          region: { x: 62, y: 6, width: 34, height: 88 },
        }}
      />
    );

    fireEvent.error(screen.getByRole('img', { name: image.alt }));
    expect(frame()).toHaveAttribute('data-status', 'error');
    expect(screen.getByRole('img', { name: image.alt })).toHaveClass(
      'psf__fallback'
    );
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(container.querySelector('.psf-focus')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('labels the feature focus and keeps a long label to one line', async () => {
    const label =
      'Every link, release and contact option on one profile, ordered by what visitors tap first';
    const { container } = render(
      <ProductScreenshotFrame
        scenarioId={PHONE_SCENARIO}
        sizes={SIZES}
        device='phone'
        focus={{ label, region: { x: 6, y: 30, width: 88, height: 40 } }}
      />
    );

    expect(container.querySelector('.psf-focus')).toHaveAttribute(
      'data-feature-label',
      label
    );
    expect(screen.getByText(label)).toHaveClass('psf-focus__label');
    await expectNoA11yViolations(container);
  });

  it('uses an override name, or none when decorative, and keeps RTL focus labels', async () => {
    const { container, rerender } = render(
      <ProductScreenshotFrame
        scenarioId={SCENARIO}
        sizes={SIZES}
        altOverride='Releases workspace'
      />
    );
    expect(
      screen.getByRole('img', { name: 'Releases workspace' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl'>
        <ProductScreenshotFrame
          scenarioId={SCENARIO}
          sizes={SIZES}
          aria-hidden
          focus={{
            label: 'شريط الإصدارات الموحد',
            region: { x: 62, y: 6, width: 34, height: 88 },
          }}
        />
      </div>
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('شريط الإصدارات الموحد')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
