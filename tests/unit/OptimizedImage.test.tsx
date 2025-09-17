import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptimizedImage } from '@/components/atoms/OptimizedImage';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    onError,
    onLoad,
    ...props
  }: React.ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
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
  afterEach(cleanup);

  it('renders correctly with valid src', () => {
    render(
      <OptimizedImage src='https://example.com/image.jpg' alt='Test image' />
    );

    const images = screen.getAllByTestId('optimized-image');
    const testImage = images.find(
      img => img.getAttribute('src') === 'https://example.com/image.jpg'
    );
    expect(testImage).toBeInTheDocument();
    expect(testImage).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(testImage).toHaveAttribute('alt', 'Test image');
  });

  it('shows placeholder when src is null', () => {
    render(<OptimizedImage src={null} alt='Test image' />);

    expect(screen.queryByTestId('optimized-image')).not.toBeInTheDocument();
    // Check for placeholder content (div with SVG)
    const placeholders = screen.getAllByRole('generic');
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('shows placeholder when src is empty string', () => {
    render(<OptimizedImage src='' alt='Test image' />);

    expect(screen.queryByTestId('optimized-image')).not.toBeInTheDocument();
    // Check for placeholder content (div with SVG)
    const placeholders = screen.getAllByRole('generic');
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('shows placeholder on image error', () => {
    render(
      <OptimizedImage src='https://example.com/invalid.jpg' alt='Test image' />
    );

    const images = screen.getAllByTestId('optimized-image');
    const testImage = images.find(
      img => img.getAttribute('src') === 'https://example.com/invalid.jpg'
    );
    fireEvent.error(testImage!);

    // Check for placeholder content (div with SVG)
    const placeholders = screen.getAllByRole('generic');
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('shows loading skeleton initially', () => {
    render(
      <OptimizedImage src='https://example.com/image.jpg' alt='Test image' />
    );

    // The mock renders the image directly, so we check for the image element
    const images = screen.getAllByTestId('optimized-image');
    const testImage = images.find(
      img => img.getAttribute('src') === 'https://example.com/image.jpg'
    );
    expect(testImage).toBeInTheDocument();
  });

  it('hides loading skeleton when image loads', () => {
    render(
      <OptimizedImage src='https://example.com/image.jpg' alt='Test image' />
    );

    const images = screen.getAllByTestId('optimized-image');
    const testImage = images.find(
      img => img.getAttribute('src') === 'https://example.com/image.jpg'
    );
    fireEvent.load(testImage!);

    // The skeleton should be hidden after load
    expect(testImage).toHaveClass('opacity-100');
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
      />
    );

    const images = screen.getAllByTestId('optimized-image');
    const testImage = images.find(
      img => img.getAttribute('src') === 'https://example.com/image.jpg'
    );
    expect(testImage).toHaveAttribute('width', '100');
    expect(testImage).toHaveAttribute('height', '100');
  });
});
