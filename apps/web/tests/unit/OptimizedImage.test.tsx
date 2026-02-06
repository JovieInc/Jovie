import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OptimizedImage } from '@/components/molecules/OptimizedImage';

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
      data-testid='optimized-image'
    />
  ),
}));

describe('OptimizedImage', () => {
  it('renders correctly with valid src', () => {
    render(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test image'
        enableVersioning={false}
      />
    );

    const image = screen.getByTestId('optimized-image');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    // SEO generator extracts filename and uses "Image" from the URL
    expect(image).toHaveAttribute('alt', 'Image');
  });

  it('shows fallback image when src is null', () => {
    render(
      <OptimizedImage src={null} alt='Test image' enableVersioning={false} />
    );

    // Component shows fallback image instead of placeholder
    const image = screen.getByTestId('optimized-image');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', '/avatars/default-user.png');
  });

  it('shows fallback image when src is empty string', () => {
    render(<OptimizedImage src='' alt='Test image' enableVersioning={false} />);

    // Component shows fallback image instead of placeholder
    const image = screen.getByTestId('optimized-image');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', '/avatars/default-user.png');
  });

  it('shows fallback image on error', () => {
    render(
      <OptimizedImage
        src='https://example.com/invalid.jpg'
        alt='Test image'
        enableVersioning={false}
      />
    );

    const image = screen.getByTestId('optimized-image');
    fireEvent.error(image);

    // After error, component switches to fallback image
    const fallbackImage = screen.getByTestId('optimized-image');
    expect(fallbackImage).toHaveAttribute('src', '/avatars/default-user.png');
  });

  it('shows loading skeleton initially', () => {
    render(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test image'
        enableVersioning={false}
      />
    );

    // Image starts with opacity-0 while loading
    const image = screen.getByTestId('optimized-image');
    expect(image).toHaveClass('opacity-0');
  });

  it('hides loading skeleton when image loads', () => {
    render(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test image'
        enableVersioning={false}
      />
    );

    const image = screen.getByTestId('optimized-image');
    fireEvent.load(image);

    // After load, image should have opacity-100
    expect(image).toHaveClass('opacity-100');
  });

  it('renders with different sizes', () => {
    const { rerender } = render(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test'
        size='sm'
      />
    );
    expect(screen.getAllByTestId('optimized-image').length).toBeGreaterThan(0);

    rerender(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test'
        size='md'
      />
    );
    expect(screen.getAllByTestId('optimized-image').length).toBeGreaterThan(0);

    rerender(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test'
        size='lg'
      />
    );
    expect(screen.getAllByTestId('optimized-image').length).toBeGreaterThan(0);
  });

  it('renders with different shapes', () => {
    const { rerender } = render(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test'
        shape='square'
      />
    );
    expect(screen.getAllByTestId('optimized-image').length).toBeGreaterThan(0);

    rerender(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test'
        shape='circle'
      />
    );
    expect(screen.getAllByTestId('optimized-image').length).toBeGreaterThan(0);
  });

  it('renders with width and height', () => {
    render(
      <OptimizedImage
        src='https://example.com/image.jpg'
        alt='Test image'
        width={100}
        height={100}
        enableVersioning={false}
      />
    );

    const image = screen.getByTestId('optimized-image');
    expect(image).toHaveAttribute('width', '100');
    expect(image).toHaveAttribute('height', '100');
  });
});
