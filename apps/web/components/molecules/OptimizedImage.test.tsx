import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OptimizedImage } from './OptimizedImage';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    onError,
    onLoad,
    fill: _fill,
    priority: _priority,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    unoptimized: _unoptimized,
    ...rest
  }: ComponentProps<'img'> & Record<string, unknown>) => (
    <img
      src={src as string}
      alt={alt}
      onError={onError}
      onLoad={onLoad}
      data-testid='optimized-image'
      {...rest}
    />
  ),
}));

describe('OptimizedImage', () => {
  it('shows the skeleton with theme tokens until the image loads', async () => {
    const { container } = render(
      <OptimizedImage
        src='https://example.com/a.jpg'
        alt='Artist'
        enableVersioning={false}
      />
    );

    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('from-surface-1');
    expect(skeleton?.className).not.toContain('gray');
    await expectNoA11yViolations(container);

    fireEvent.load(screen.getByTestId('optimized-image'));

    expect(container.querySelector('.animate-pulse')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back to the default avatar when the image errors', async () => {
    const { container } = render(
      <OptimizedImage
        src='https://example.com/broken.jpg'
        alt='Artist'
        enableVersioning={false}
        fallbackSrc='/fallback.png'
      />
    );

    fireEvent.error(screen.getByTestId('optimized-image'));

    expect(screen.getByTestId('optimized-image')).toHaveAttribute(
      'src',
      '/fallback.png'
    );
    await expectNoA11yViolations(container);
  });

  it('renders the placeholder when there is no source and no fallback', async () => {
    const { container } = render(
      <OptimizedImage src={null} alt='Artist' fallbackSrc='' />
    );

    expect(screen.queryByTestId('optimized-image')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
