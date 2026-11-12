import { fireEvent, render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ImageWithFallback } from './ImageWithFallback';

// next/image needs the Next runtime loader; a plain <img> keeps the real
// onError wiring that drives the fallback.
vi.mock('next/image', () => ({
  default: ({
    fill,
    unoptimized,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    unoptimized?: boolean;
    priority?: boolean;
  }) => (
    <img
      {...props}
      alt={props.alt}
      data-fill={fill ? 'true' : undefined}
      data-unoptimized={unoptimized ? 'true' : 'false'}
    />
  ),
}));

const SRC = 'https://example.com/artwork.jpg';

describe('ImageWithFallback', () => {
  it('renders the image with its alt text while the source loads', async () => {
    const { container } = render(
      <ImageWithFallback
        src={SRC}
        alt='Night Drive artwork'
        width={64}
        height={64}
      />
    );

    const image = screen.getByRole('img', { name: 'Night Drive artwork' });
    expect(image.tagName).toBe('IMG');
    expect(image).toHaveAttribute('src', SRC);
    await expectNoA11yViolations(container);
  });

  it('shows a labelled placeholder when there is no source', async () => {
    const { container } = render(
      <ImageWithFallback
        src={null}
        alt='Night Drive artwork'
        fallbackVariant='release'
      />
    );

    const placeholder = screen.getByRole('img', {
      name: 'Night Drive artwork',
    });
    expect(placeholder.tagName).toBe('DIV');
    expect(placeholder).toHaveClass('h-full', 'w-full');
    expect(placeholder.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('swaps to the placeholder and reports the failure when the image errors', async () => {
    const onLoadError = vi.fn();
    const { container } = render(
      <ImageWithFallback
        src={SRC}
        alt='Night Drive artwork'
        width={64}
        height={64}
        onLoadError={onLoadError}
      />
    );

    fireEvent.error(screen.getByRole('img', { name: 'Night Drive artwork' }));

    expect(onLoadError).toHaveBeenCalledTimes(1);
    const placeholder = screen.getByRole('img', {
      name: 'Night Drive artwork',
    });
    expect(placeholder.tagName).toBe('DIV');
    await expectNoA11yViolations(container);
  });

  it('retries the image when the source changes after a failure', () => {
    const { rerender } = render(
      <ImageWithFallback src={SRC} alt='Artwork' width={64} height={64} />
    );
    fireEvent.error(screen.getByRole('img', { name: 'Artwork' }));
    expect(screen.getByRole('img', { name: 'Artwork' }).tagName).toBe('DIV');

    rerender(
      <ImageWithFallback
        src='https://example.com/artwork-2.jpg'
        alt='Artwork'
        width={64}
        height={64}
      />
    );

    const image = screen.getByRole('img', { name: 'Artwork' });
    expect(image.tagName).toBe('IMG');
    expect(image).toHaveAttribute('src', 'https://example.com/artwork-2.jpg');
  });

  it('fills a positioned parent when used with fill', () => {
    render(
      <ImageWithFallback
        src={undefined}
        alt='Artwork'
        fill
        fallbackClassName='rounded-lg'
      />
    );

    expect(screen.getByRole('img', { name: 'Artwork' })).toHaveClass(
      'absolute',
      'inset-0',
      'rounded-lg'
    );
  });

  it('keeps a decorative placeholder out of the accessibility tree', async () => {
    const { container } = render(
      <ImageWithFallback src={null} alt='' fallbackVariant='avatar' />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('draws a different glyph for each fallback variant', () => {
    const glyphFor = (variant: 'release' | 'avatar' | 'generic') => {
      const { container, unmount } = render(
        <ImageWithFallback src={null} alt='' fallbackVariant={variant} />
      );
      const markup = container.querySelector('svg')?.innerHTML ?? '';
      unmount();
      return markup;
    };

    const glyphs = new Set([
      glyphFor('release'),
      glyphFor('avatar'),
      glyphFor('generic'),
    ]);
    expect(glyphs.size).toBe(3);
  });
});
