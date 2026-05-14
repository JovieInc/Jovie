import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    onError,
    onLoad,
    ...props
  }: React.ComponentProps<'img'>) => (
    <img
      src={src}
      alt={alt}
      onError={onError}
      onLoad={onLoad}
      {...props}
      data-testid='next-image'
    />
  ),
}));

describe('ImageWithFallback', () => {
  it('renders an image when src is provided', () => {
    render(
      <ImageWithFallback
        src='https://i.scdn.co/image/test.jpg'
        alt='Album art'
        width={64}
        height={64}
      />
    );

    const img = screen.getByTestId('next-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://i.scdn.co/image/test.jpg');
  });

  it('shows release fallback when src is null', () => {
    render(
      <ImageWithFallback
        src={null as unknown as string}
        alt='Missing artwork'
        width={64}
        height={64}
        fallbackVariant='release'
      />
    );

    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    const fallback = screen.getByRole('img', { name: 'Missing artwork' });
    expect(fallback).toBeInTheDocument();
  });

  it('shows fallback on image load error', () => {
    render(
      <ImageWithFallback
        src='https://i.scdn.co/image/expired.jpg'
        alt='Broken image'
        width={64}
        height={64}
        fallbackVariant='release'
      />
    );

    const img = screen.getByTestId('next-image');
    fireEvent.error(img);

    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    const fallback = screen.getByRole('img', { name: 'Broken image' });
    expect(fallback).toBeInTheDocument();
  });

  it('resets error state when src changes', () => {
    const { rerender } = render(
      <ImageWithFallback
        src='https://i.scdn.co/image/bad.jpg'
        alt='Test'
        width={64}
        height={64}
      />
    );

    // Trigger error
    fireEvent.error(screen.getByTestId('next-image'));
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();

    // Change src — should reset and show image again
    rerender(
      <ImageWithFallback
        src='https://i.scdn.co/image/good.jpg'
        alt='Test'
        width={64}
        height={64}
      />
    );

    expect(screen.getByTestId('next-image')).toBeInTheDocument();
  });

  it('uses avatar fallback variant', () => {
    render(
      <ImageWithFallback
        src={null as unknown as string}
        alt='User avatar'
        width={48}
        height={48}
        fallbackVariant='avatar'
      />
    );

    const fallback = screen.getByRole('img', { name: 'User avatar' });
    expect(fallback).toBeInTheDocument();
    // Avatar variant renders a person silhouette SVG with fill="currentColor"
    const svg = fallback.querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it('uses generic fallback variant by default', () => {
    render(
      <ImageWithFallback
        src={null as unknown as string}
        alt='Some image'
        width={48}
        height={48}
      />
    );

    const fallback = screen.getByRole('img', { name: 'Some image' });
    expect(fallback).toBeInTheDocument();
  });

  it('uses absolute inset-0 layout for fallback when fill prop is set', () => {
    render(
      <ImageWithFallback
        src={null as unknown as string}
        alt='Fill image'
        fill
        fallbackVariant='release'
      />
    );

    const fallback = screen.getByRole('img', { name: 'Fill image' });
    expect(fallback).toHaveClass('absolute');
    expect(fallback).toHaveClass('inset-0');
    // Should NOT have h-full w-full when fill is used
    expect(fallback).not.toHaveClass('h-full');
    expect(fallback).not.toHaveClass('w-full');
  });

  it('calls onLoadError when image fails to load', () => {
    const onLoadError = vi.fn();
    render(
      <ImageWithFallback
        src='https://i.scdn.co/image/broken.jpg'
        alt='Broken'
        width={64}
        height={64}
        onLoadError={onLoadError}
      />
    );

    fireEvent.error(screen.getByTestId('next-image'));

    expect(onLoadError).toHaveBeenCalledOnce();
  });

  it('does not call onLoadError when src is null (no image attempted)', () => {
    const onLoadError = vi.fn();
    render(
      <ImageWithFallback
        src={null as unknown as string}
        alt='Null src'
        width={64}
        height={64}
        onLoadError={onLoadError}
      />
    );

    // Fallback renders immediately, no image load attempted
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    expect(onLoadError).not.toHaveBeenCalled();
  });
});
