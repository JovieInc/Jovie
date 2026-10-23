import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

const screenshot = {
  alt: 'Profile editor preview',
  aspectRatio: '16 / 9',
  chrome: 'window',
  height: 900,
  isAvailable: true,
  priority: false,
  src: '/preview.png',
  testId: 'screenshot',
  title: 'Profile editor',
  width: 1600,
} as const;

describe('ProductScreenshotFrame', () => {
  it('rounds the image and its frame while preserving image error recovery', () => {
    const onImageError = vi.fn();
    render(
      <ProductScreenshotFrame {...screenshot} onImageError={onImageError} />
    );

    const image = screen.getByRole('img', { name: screenshot.alt });
    expect(image).toHaveClass('marketing-rounded-frame');
    expect(screen.getByTestId('screenshot')).toHaveClass(
      'marketing-rounded-frame'
    );
    expect(screen.getByText(screenshot.title)).toBeVisible();
    fireEvent.error(image);
    expect(onImageError).toHaveBeenCalledOnce();
  });

  it('keeps an unavailable preview labeled and rounded without loading an image', () => {
    render(
      <ProductScreenshotFrame
        {...screenshot}
        chrome='minimal'
        isAvailable={false}
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('figure', { name: screenshot.alt })).toHaveClass(
      'marketing-rounded-frame'
    );
    expect(screen.getByText('Preview coming soon')).toBeVisible();
  });
});
