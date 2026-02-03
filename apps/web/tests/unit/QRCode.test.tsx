import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QRCode } from '@/components/atoms/QRCode';

// Mock Next.js Image component
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, width, height, onError, ...props }: any) => {
    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Test mock component
      // eslint-disable-next-line @next/next/no-img-element -- Mock for next/image
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        onError={onError}
        {...props}
      />
    );
  },
}));

describe('QRCode', () => {
  const mockData = 'https://example.com';

  it('renders QR code image with correct attributes', () => {
    render(<QRCode data={mockData} />);

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'QR Code');
    expect(img).toHaveAttribute('width', '120');
    expect(img).toHaveAttribute('height', '120');
  });

  it('generates correct QR code URL', () => {
    render(<QRCode data={mockData} size={100} />);

    const img = screen.getByRole('img');
    const expectedUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(mockData)}`;
    expect(img).toHaveAttribute('src', expectedUrl);
  });

  it('uses custom size when provided', () => {
    render(<QRCode data={mockData} size={200} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('width', '200');
    expect(img).toHaveAttribute('height', '200');
  });

  it('uses custom label when provided', () => {
    const customLabel = 'Custom QR Label';
    render(<QRCode data={mockData} label={customLabel} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', customLabel);
  });

  it('applies custom className', () => {
    const customClass = 'custom-qr-class';
    render(<QRCode data={mockData} className={customClass} />);

    const img = screen.getByRole('img');
    expect(img).toHaveClass(customClass);
  });

  it('shows error state when image fails to load', () => {
    render(<QRCode data={mockData} label='Test QR' />);

    const img = screen.getByRole('img');

    // Simulate image load error using Testing Library helper
    fireEvent.error(img);

    // Should show error fallback
    const errorElement = screen.getByRole('img', {
      name: 'Test QR unavailable',
    });
    expect(errorElement).toBeInTheDocument();
    expect(errorElement).toHaveTextContent('QR code unavailable');
  });

  it('properly encodes special characters in data', () => {
    const specialData = 'https://example.com?param=test&other=value';
    render(<QRCode data={specialData} />);

    const img = screen.getByRole('img');
    const expectedUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(specialData)}`;
    expect(img).toHaveAttribute('src', expectedUrl);
  });
});
