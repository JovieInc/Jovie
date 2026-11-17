import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QRCode } from '@/components/molecules/QRCode';

// Mock Next.js Image component
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, width, height, ...props }: any) => {
    return <img src={src} alt={alt} width={width} height={height} {...props} />;
  },
}));

// The QR is generated locally from the `qrcode` dependency — no third-party
// request is made for QR images (the profile pages publish a zero
// third-party-requests claim, apps/web/content/comparative-claims.ts).
const { toDataURL } = vi.hoisted(() => ({
  DATA_URL: 'data:image/png;base64,QRPNG',
  toDataURL: vi.fn<
    (
      data: string,
      options: { width: number; margin: number }
    ) => Promise<string>
  >(async () => 'data:image/png;base64,QRPNG'),
}));

// `import('qrcode')` reads the named export. A default-only mock throws
// "No toDataURL export is defined" and every success path renders the fallback.
vi.mock('qrcode', () => ({
  __esModule: true,
  toDataURL: (...args: unknown[]) =>
    toDataURL(...(args as [string, { width: number; margin: number }])),
  default: {
    toDataURL: (...args: unknown[]) =>
      toDataURL(...(args as [string, { width: number; margin: number }])),
  },
}));

describe('QRCode', () => {
  const mockData = 'https://example.com';

  it('renders QR code image with correct attributes', async () => {
    render(<QRCode data={mockData} />);

    const img = await screen.findByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'QR Code');
    expect(img).toHaveAttribute('width', '120');
    expect(img).toHaveAttribute('height', '120');
  });

  it('renders a locally generated data URL, never a third-party src', async () => {
    render(<QRCode data={mockData} size={100} />);

    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toMatch(/^data:/);
    expect(toDataURL).toHaveBeenCalledWith(mockData, {
      width: 100,
      margin: 1,
    });
  });

  it('uses custom size when provided', async () => {
    render(<QRCode data={mockData} size={200} />);

    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('width', '200');
    expect(img).toHaveAttribute('height', '200');
  });

  it('uses custom label when provided', async () => {
    const customLabel = 'Custom QR Label';
    render(<QRCode data={mockData} label={customLabel} />);

    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('alt', customLabel);
  });

  it('applies custom className', async () => {
    const customClass = 'custom-qr-class';
    render(<QRCode data={mockData} className={customClass} />);

    const img = await screen.findByRole('img');
    expect(img).toHaveClass(customClass);
  });

  it('shows error state when generation fails', async () => {
    toDataURL.mockRejectedValueOnce(new Error('encoding failed'));
    // A fresh payload: earlier cases cache `mockData` at this size, and a
    // cache hit would skip the rejection.
    render(
      <QRCode data='https://example.com/encoding-failed' label='Test QR' />
    );

    // Should show error fallback (aria-hidden div with text)
    expect(await screen.findByText('QR code unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('properly encodes special characters in data', async () => {
    const specialData = 'https://example.com?param=test&other=value';
    render(<QRCode data={specialData} />);

    await screen.findByRole('img');
    expect(toDataURL).toHaveBeenCalledWith(specialData, {
      width: 120,
      margin: 1,
    });
  });
});
