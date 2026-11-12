import { fireEvent, render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { getQrCodeUrl, QRCode } from './QRCode';

// A plain <img> keeps the load and error events under the test's control;
// jsdom never requests the third-party image, so no network is touched.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} alt={props.alt} />
  ),
}));

const LABEL = 'Scan To Open This Profile On Your Phone';

function skeleton(container: HTMLElement) {
  return container.querySelector('.animate-pulse');
}

describe('QRCode: certificate states', () => {
  it('shows a hidden skeleton while the image is loading', async () => {
    const { container } = render(
      <QRCode data='https://jov.ie/tim' label={LABEL} />
    );
    expect(skeleton(container)).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton(container)).toHaveClass('motion-reduce:animate-none');
    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('drops the skeleton once the image loads and keeps the frame size', async () => {
    const { container } = render(
      <QRCode data='https://jov.ie/tim' size={150} label={LABEL} />
    );
    fireEvent.load(screen.getByRole('img', { name: LABEL }));
    expect(skeleton(container)).toBeNull();
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('150px');
    expect(frame.style.height).toBe('150px');
    await expectNoA11yViolations(container);
  });

  it('uses the default size and label when only data is given', async () => {
    const { container } = render(<QRCode data='https://jov.ie/tim' />);
    const image = screen.getByRole('img', { name: 'QR Code' });
    expect(image).toHaveAttribute('width', '120');
    expect(image).toHaveAttribute(
      'src',
      getQrCodeUrl('https://jov.ie/tim', 120)
    );
    await expectNoA11yViolations(container);
  });

  it('still renders a code for empty data', async () => {
    const { container } = render(<QRCode data='' label='HUD Link' />);
    expect(screen.getByRole('img', { name: 'HUD Link' })).toHaveAttribute(
      'src',
      'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data='
    );
    await expectNoA11yViolations(container);
  });

  it('shows the same-size fallback when the image fails', async () => {
    const { container } = render(
      <QRCode data='https://jov.ie/tim' size={140} label={LABEL} />
    );
    fireEvent.error(screen.getByRole('img', { name: LABEL }));
    expect(screen.queryByRole('img')).toBeNull();
    const fallback = screen.getByText('QR code unavailable');
    const frame = fallback.parentElement as HTMLElement;
    expect(frame.style.width).toBe('140px');
    expect(frame.style.height).toBe('140px');
    expect(skeleton(container)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('retries with a fresh loading state when the data changes after a failure', () => {
    const { container, rerender } = render(
      <QRCode data='https://jov.ie/tim' label={LABEL} />
    );
    fireEvent.error(screen.getByRole('img', { name: LABEL }));
    expect(screen.getByText('QR code unavailable')).toBeInTheDocument();

    rerender(<QRCode data='https://jov.ie/tim?mode=pay' label={LABEL} />);
    expect(screen.getByRole('img', { name: LABEL })).toHaveAttribute(
      'src',
      getQrCodeUrl('https://jov.ie/tim?mode=pay', 120)
    );
    expect(skeleton(container)).not.toBeNull();
  });

  it('encodes long URLs whole and keeps a long label as the name', async () => {
    const data =
      'https://jov.ie/tim/never-say-a-word?utm_source=qr&utm_medium=print&utm_campaign=summer-tour-poster';
    const label =
      'Scan to open Never Say A Word (Extended Club Mix) on your phone from the summer tour poster';
    const { container } = render(<QRCode data={data} label={label} />);
    expect(screen.getByRole('img', { name: label })).toHaveAttribute(
      'src',
      `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data)}`
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations right to left', async () => {
    const label = 'امسح لفتح هذا الملف الشخصي على هاتفك';
    const { container } = render(
      <div dir='rtl'>
        <QRCode data='https://jov.ie/tim' label={label} />
      </div>
    );
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
