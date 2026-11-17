import { render, screen, waitFor } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { QRCodeCard } from './QRCodeCard';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} alt={props.alt} />
  ),
}));

const { toDataURL } = vi.hoisted(() => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,QRPNG'),
}));

vi.mock('qrcode', () => ({
  __esModule: true,
  toDataURL: (...args: unknown[]) => toDataURL(...(args as [])),
  default: { toDataURL: (...args: unknown[]) => toDataURL(...(args as [])) },
}));

describe('QRCodeCard', () => {
  it('renders the code with the default title as its alt text', async () => {
    const { container } = render(
      <QRCodeCard data='https://jov.ie/default-card' />
    );

    const image = await screen.findByRole('img', { name: 'Scan QR Code' });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,QRPNG');
    expect(image).toHaveAttribute('width', '120');
    expect(
      screen.getByRole('heading', { level: 3, name: 'Scan QR Code' })
    ).toBeVisible();
    expect(container.querySelector('p')).toBeNull();
    expect(toDataURL).toHaveBeenCalledWith('https://jov.ie/default-card', {
      width: 120,
      margin: 1,
    });
    await expectNoA11yViolations(container);
  });

  it('shows a custom title, description and size', async () => {
    const { container } = render(
      <QRCodeCard
        data='https://jov.ie/pay-card'
        title='Pay Artist'
        description='Scan to pay via Apple Pay'
        qrSize={150}
        className='p-4'
      />
    );

    const image = await screen.findByRole('img', { name: 'Pay Artist' });
    expect(image).toHaveAttribute('width', '150');
    expect(screen.getByText('Scan to pay via Apple Pay')).toBeVisible();
    expect(container.firstElementChild).toHaveClass('text-center', 'p-4');
    await expectNoA11yViolations(container);
  });

  it('drops the heading and marks the code decorative when the title is empty', async () => {
    const { container } = render(
      <QRCodeCard
        data='https://jov.ie/no-title'
        title=''
        description='Scan with your camera app'
      />
    );

    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('alt', '')
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Scan with your camera app')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the unavailable fallback when there is nothing to encode', async () => {
    const { container } = render(<QRCodeCard data='' />);

    expect(await screen.findByText('QR code unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean', async () => {
    const title =
      'Scan to open this artist profile on your phone and follow along';
    const { container } = render(
      <div dir='rtl'>
        <QRCodeCard
          data='https://jov.ie/rtl-card'
          title={title}
          description='امسح الرمز بهاتفك لعرض الملف الشخصي'
        />
      </div>
    );

    expect(await screen.findByRole('img', { name: title })).toBeVisible();
    expect(
      screen.getByText('امسح الرمز بهاتفك لعرض الملف الشخصي')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
