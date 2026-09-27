import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { getScreenshotFeatureFocus } from '@/lib/screenshots/registry';

const DESKTOP_SCENARIO = 'dashboard-releases-sidebar-desktop';
const FOCUS_SCENARIO = 'tim-white-profile-pay-mobile';
const SIZES = '100vw';

function frame(scenarioId = DESKTOP_SCENARIO) {
  return screen.getByTestId(`product-screenshot-frame-${scenarioId}`);
}

describe('ProductScreenshotFrame — dark-glass product frame (JOV-6247)', () => {
  it('keeps the flat treatment as the default', () => {
    render(
      <ProductScreenshotFrame scenarioId={DESKTOP_SCENARIO} sizes={SIZES} />
    );

    const el = frame();
    expect(el).toHaveAttribute('data-variant', 'flat');
    expect(el).not.toHaveClass('psf--dark-glass');
  });

  it('applies the locked dark-glass material as a variant', () => {
    render(
      <ProductScreenshotFrame
        scenarioId={DESKTOP_SCENARIO}
        sizes={SIZES}
        variant='dark-glass'
      />
    );

    const el = frame();
    expect(el).toHaveAttribute('data-variant', 'dark-glass');
    expect(el).toHaveClass('psf--dark-glass');
  });

  it('keeps captured UI opaque and unmodified by the frame treatment', () => {
    render(
      <ProductScreenshotFrame
        scenarioId={DESKTOP_SCENARIO}
        sizes={SIZES}
        variant='dark-glass'
      />
    );

    const img = screen.getByRole('img', { name: /releases with sidebar/i });
    expect(img.className).not.toMatch(/opacity-/);
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining('/product-screenshots/')
    );
  });

  it('renders the loading skeleton before the image loads', () => {
    const { container } = render(
      <ProductScreenshotFrame scenarioId={DESKTOP_SCENARIO} sizes={SIZES} />
    );

    expect(frame()).toHaveAttribute('data-status', 'loading');
    expect(container.querySelector('.psf__skeleton')).toBeInTheDocument();
  });

  it('renders the failed-image fallback with stable geometry', () => {
    const { container } = render(
      <ProductScreenshotFrame scenarioId={DESKTOP_SCENARIO} sizes={SIZES} />
    );

    fireEvent.error(screen.getByRole('img'));

    const el = frame();
    expect(el).toHaveAttribute('data-status', 'error');
    expect(el.style.aspectRatio).toBeTruthy();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(container.querySelector('.psf__fallback')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});

describe('ProductScreenshotFrame — feature focus', () => {
  it('exposes the registry-declared feature focus for the pay capture', () => {
    const focus = getScreenshotFeatureFocus(FOCUS_SCENARIO);

    expect(focus?.label).toBe('Pay with Venmo');
    expect(focus?.region).toEqual({ x: 4, y: 80, width: 92, height: 15 });
    expect(getScreenshotFeatureFocus(DESKTOP_SCENARIO)).toBeNull();
    expect(getScreenshotFeatureFocus('does-not-exist')).toBeNull();
  });

  it('identifies the feature region and neutralizes only the surroundings', () => {
    const { container } = render(
      <ProductScreenshotFrame
        scenarioId={FOCUS_SCENARIO}
        device='phone'
        sizes={SIZES}
        variant='dark-glass'
      />
    );

    const overlay = container.querySelector('.psf-focus');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute('data-feature-label', 'Pay with Venmo');
    expect(container.querySelectorAll('.psf-focus__scrim')).toHaveLength(4);
    expect(screen.getByText('Pay with Venmo')).toBeInTheDocument();

    // The screenshot itself stays fully opaque — only scrim siblings dim.
    const img = container.querySelector('img');
    expect(img?.className).not.toMatch(/opacity-/);
    expect(overlay?.parentElement).toContainElement(img);
  });

  it('supports breakpoint-specific safe areas via mobile region vars', () => {
    const { container } = render(
      <ProductScreenshotFrame
        scenarioId={DESKTOP_SCENARIO}
        sizes={SIZES}
        focus={{
          label: 'Release sidebar',
          region: { x: 62, y: 6, width: 34, height: 88 },
          mobileRegion: { x: 40, y: 4, width: 56, height: 92 },
        }}
      />
    );

    const overlay = container.querySelector<HTMLElement>('.psf-focus');
    expect(overlay?.style.getPropertyValue('--psf-fx')).toBe('62%');
    expect(overlay?.style.getPropertyValue('--psf-fx-m')).toBe('40%');
    expect(overlay?.style.getPropertyValue('--psf-fh-m')).toBe('92%');
  });

  it('truncates long labels inside the declared region', () => {
    const longLabel =
      'Unified release sidebar with per-platform status across every connected DSP';
    const { container } = render(
      <ProductScreenshotFrame
        scenarioId={DESKTOP_SCENARIO}
        sizes={SIZES}
        focus={{
          label: longLabel,
          region: { x: 10, y: 10, width: 30, height: 20 },
        }}
      />
    );

    const label = container.querySelector<HTMLElement>('.psf-focus__label');
    expect(label).toHaveTextContent(longLabel);
  });

  it('lets callers disable a registry-declared focus', () => {
    const { container } = render(
      <ProductScreenshotFrame
        scenarioId={FOCUS_SCENARIO}
        device='phone'
        sizes={SIZES}
        focus={null}
      />
    );

    expect(container.querySelector('.psf-focus')).not.toBeInTheDocument();
  });

  it('drops the focus treatment when the image fails', () => {
    const { container } = render(
      <ProductScreenshotFrame
        scenarioId={FOCUS_SCENARIO}
        device='phone'
        sizes={SIZES}
      />
    );

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('.psf-focus')).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });
});
