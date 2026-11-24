import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

const props = {
  alt: 'Release dashboard preview',
  aspectRatio: '16 / 9',
  chrome: 'window',
  height: 900,
  isAvailable: true,
  priority: false,
  src: '/images/dashboard.png',
  title: 'Dashboard',
  width: 1600,
} as const;

describe('ProductScreenshotFrame', () => {
  it('shows an accessible unavailable preview instead of a broken screenshot', () => {
    render(
      <ProductScreenshotFrame {...props} chrome='minimal' isAvailable={false} />
    );
    expect(screen.getByRole('figure', { name: props.alt })).toBeVisible();
    expect(screen.getByRole('figure', { name: props.alt })).toHaveClass(
      'marketing-rounded-frame'
    );
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    expect(screen.getByText(props.title)).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('renders available media and forwards image errors to the caller', () => {
    const onImageError = vi.fn();
    render(<ProductScreenshotFrame {...props} onImageError={onImageError} />);
    const image = screen.getByRole('img', { name: props.alt });
    expect(image).toBeVisible();
    expect(image).toHaveClass('marketing-rounded-frame');
    expect(image.closest('figure')).toHaveClass('marketing-rounded-frame');
    expect(image).toHaveAttribute('width', '1600');
    expect(screen.queryByText('Preview unavailable')).toBeNull();
    fireEvent.error(image);
    expect(onImageError).toHaveBeenCalledOnce();
  });

  it('draws the frame with tokens only and no inline colour', async () => {
    const { container } = render(
      <ProductScreenshotFrame {...props} testId='frame' />
    );
    const frame = screen.getByTestId('frame');
    expect(frame).toHaveClass('shadow-card-elevated');
    expect(frame).not.toHaveAttribute('style');
    expect(container.innerHTML).not.toMatch(/rgba\(/);
    expect(container.querySelector('.via-on-media\\/20')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations in the unavailable state and keeps the window title', async () => {
    const { container } = render(
      <ProductScreenshotFrame {...props} isAvailable={false} />
    );
    expect(screen.getAllByText(props.title).length).toBeGreaterThan(0);
    expect(container.querySelector('.border-black\\/10')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
