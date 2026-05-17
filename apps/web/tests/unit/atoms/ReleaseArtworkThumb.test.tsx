import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReleaseArtworkThumb } from '@/components/atoms/ReleaseArtworkThumb';

vi.mock('next/image', () => ({
  default: ({ src, alt, fill, onError, ...props }: any) => (
    <img
      src={src}
      alt={alt}
      data-fill={fill ? 'true' : undefined}
      onError={onError}
      {...props}
    />
  ),
}));

describe('ReleaseArtworkThumb', () => {
  it('renders image when src is provided', () => {
    render(<ReleaseArtworkThumb src='/art.jpg' alt='Album art' />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/art.jpg');
  });

  it('image has correct alt text', () => {
    render(<ReleaseArtworkThumb src='/art.jpg' alt='My Album' />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'My Album');
  });

  it('renders fallback icon when src is null', () => {
    render(<ReleaseArtworkThumb src={null} alt='Missing art' />);
    expect(screen.getByText('Missing art')).toBeInTheDocument();
    expect(
      document.querySelector('[data-artwork-fallback-icon="true"]')
    ).toBeInTheDocument();
  });

  it('renders fallback icon when src is undefined', () => {
    render(<ReleaseArtworkThumb src={undefined} alt='Missing art' />);
    expect(
      document.querySelector('[data-artwork-fallback-icon="true"]')
    ).toBeInTheDocument();
  });

  it('renders fallback sr-only text when showing fallback', () => {
    render(<ReleaseArtworkThumb src={null} alt='Album title' />);
    const srOnly = screen.getByText('Album title');
    expect(srOnly).toHaveClass('sr-only');
  });

  it('uses deterministic restrained fallback style hooks', () => {
    const first = render(<ReleaseArtworkThumb src={null} alt='Missing art' />);
    const firstFallback = first.container.querySelector(
      '[data-artwork-fallback="true"]'
    ) as HTMLElement;
    const firstStyle = firstFallback.getAttribute('style') ?? '';

    const second = render(<ReleaseArtworkThumb src={null} alt='Missing art' />);
    const secondFallback = second.container.querySelector(
      '[data-artwork-fallback="true"]'
    ) as HTMLElement;

    expect(
      firstFallback.style.getPropertyValue('--artwork-fallback-angle')
    ).toBe(secondFallback.style.getPropertyValue('--artwork-fallback-angle'));
    expect(firstStyle).toContain('--artwork-fallback-base: oklch(');
    expect(firstStyle).toContain('--artwork-fallback-depth: oklch(');
    expect(firstStyle).toContain('--artwork-fallback-accent: oklch(');
    expect(firstStyle).not.toMatch(/cyan|teal|green/u);
  });

  it('fires onError handler and shows fallback when image fails to load', () => {
    render(<ReleaseArtworkThumb src='/broken.jpg' alt='Broken' />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(
      document.querySelector('[data-artwork-fallback-icon="true"]')
    ).toBeInTheDocument();
    expect(screen.getByText('Broken')).toBeInTheDocument();
  });

  it('uses default size=40', () => {
    const { container } = render(
      <ReleaseArtworkThumb src='/art.jpg' alt='Art' />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ width: '40px', height: '40px' });
  });

  it('renders with custom size applied as inline style', () => {
    const { container } = render(
      <ReleaseArtworkThumb src='/art.jpg' alt='Art' size={64} />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ width: '64px', height: '64px' });
  });
});
