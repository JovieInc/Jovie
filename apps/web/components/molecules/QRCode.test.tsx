import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { getQrCodeDataUrl, QRCode } from './QRCode';

// A plain <img> keeps the rendered contract under the test's control; the
// QR itself is generated locally from the mocked `qrcode` module, so no
// network is touched.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} alt={props.alt} />
  ),
}));

const { DATA_URL, toDataURL } = vi.hoisted(() => ({
  DATA_URL: 'data:image/png;base64,QRPNG',
  toDataURL: vi.fn<
    (
      data: string,
      options: { width: number; margin: number }
    ) => Promise<string>
  >(async () => 'data:image/png;base64,QRPNG'),
}));

// `import('qrcode')` reads the named export. A default-only mock throws
// "No toDataURL export is defined" and the component renders the fallback.
vi.mock('qrcode', () => ({
  __esModule: true,
  toDataURL: (...args: unknown[]) =>
    toDataURL(...(args as [string, { width: number; margin: number }])),
  default: {
    toDataURL: (...args: unknown[]) =>
      toDataURL(...(args as [string, { width: number; margin: number }])),
  },
}));

const LABEL = 'Scan To Open This Profile On Your Phone';

function skeleton(container: HTMLElement) {
  return container.querySelector('.animate-pulse');
}

describe('QRCode: certificate states', () => {
  it('shows a hidden skeleton while the code is generated', async () => {
    // The encoder runs only after `import('qrcode')` resolves. Hold that
    // call open, and wait until it has started, before resolving it.
    let resolveGeneration: ((url: string) => void) | undefined;
    const generationStarted = new Promise<void>(resolve => {
      toDataURL.mockImplementationOnce(
        () =>
          new Promise<string>(done => {
            resolveGeneration = done;
            resolve();
          })
      );
    });
    const { container } = render(
      <QRCode data='https://jov.ie/skeleton' label={LABEL} />
    );
    await act(async () => {
      await generationStarted;
    });
    expect(skeleton(container)).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton(container)).toHaveClass('motion-reduce:animate-none');
    expect(screen.queryByRole('img', { name: LABEL })).toBeNull();

    await act(async () => {
      resolveGeneration?.(DATA_URL);
    });
    expect(await screen.findByRole('img', { name: LABEL })).toBeInTheDocument();
    expect(skeleton(container)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the locally generated data URL and drops the skeleton', async () => {
    const { container } = render(
      <QRCode data='https://jov.ie/frame' size={150} label={LABEL} />
    );
    const image = await screen.findByRole('img', { name: LABEL });
    expect(image).toHaveAttribute('src', DATA_URL);
    expect(skeleton(container)).toBeNull();
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('150px');
    expect(frame.style.height).toBe('150px');
    await expectNoA11yViolations(container);
  });

  it('uses the default size and label when only data is given', async () => {
    const { container } = render(<QRCode data='https://jov.ie/default' />);
    const image = await screen.findByRole('img', { name: 'QR Code' });
    expect(image).toHaveAttribute('width', '120');
    expect(image).toHaveAttribute('height', '120');
    expect(toDataURL).toHaveBeenCalledWith('https://jov.ie/default', {
      width: 120,
      margin: 1,
    });
    await expectNoA11yViolations(container);
  });

  it('makes no third-party request: the src is a data URL', async () => {
    const { container } = render(
      <QRCode data='https://jov.ie/tim' label={LABEL} />
    );
    const image = await screen.findByRole('img', { name: LABEL });
    expect(image.getAttribute('src')).toMatch(/^data:/);
    await expectNoA11yViolations(container);
  });

  it('renders the unavailable fallback for empty data', async () => {
    const { container } = render(<QRCode data='' label='HUD Link' />);
    await screen.findByText('QR code unavailable');
    expect(screen.queryByRole('img')).toBeNull();
    expect(toDataURL).not.toHaveBeenCalledWith('', expect.anything());
    await expectNoA11yViolations(container);
  });

  it('shows the same-size fallback when the rendered image cannot decode', async () => {
    const { container } = render(
      <QRCode data='https://jov.ie/decode' size={140} label={LABEL} />
    );
    fireEvent.error(await screen.findByRole('img', { name: LABEL }));
    await screen.findByText('QR code unavailable');
    expect(screen.queryByRole('img')).toBeNull();
    const frame = screen.getByText('QR code unavailable')
      .parentElement as HTMLElement;
    expect(frame.style.width).toBe('140px');
    expect(frame.style.height).toBe('140px');
    expect(skeleton(container)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the same-size fallback when generation fails', async () => {
    toDataURL.mockRejectedValueOnce(new Error('encoding failed'));
    const { container } = render(
      <QRCode data='https://jov.ie/tim' size={140} label={LABEL} />
    );
    await screen.findByText('QR code unavailable');
    expect(screen.queryByRole('img')).toBeNull();
    const fallback = screen.getByText('QR code unavailable');
    const frame = fallback.parentElement as HTMLElement;
    expect(frame.style.width).toBe('140px');
    expect(frame.style.height).toBe('140px');
    expect(skeleton(container)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('recovers with a fresh state when the data changes after a failure', async () => {
    toDataURL.mockRejectedValueOnce(new Error('encoding failed'));
    const { container, rerender } = render(
      <QRCode data='https://jov.ie/recover' label={LABEL} />
    );
    await screen.findByText('QR code unavailable');

    rerender(<QRCode data='https://jov.ie/recover?mode=pay' label={LABEL} />);
    expect(await screen.findByRole('img', { name: LABEL })).toHaveAttribute(
      'src',
      DATA_URL
    );
    expect(skeleton(container)).toBeNull();
  });

  it('caches by data and size so repeat renders skip generation', async () => {
    toDataURL.mockClear();
    const first = render(<QRCode data='https://jov.ie/cache' label={LABEL} />);
    await screen.findByRole('img', { name: LABEL });
    first.unmount();

    render(<QRCode data='https://jov.ie/cache' label={LABEL} />);
    await screen.findByRole('img', { name: LABEL });
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it('encodes long URLs whole', async () => {
    const data =
      'https://jov.ie/tim/never-say-a-word?utm_source=qr&utm_medium=print&utm_campaign=summer-tour-poster';
    const label =
      'Scan to open Never Say A Word (Extended Club Mix) on your phone from the summer tour poster';
    const { container } = render(<QRCode data={data} label={label} />);
    expect(await screen.findByRole('img', { name: label })).toHaveAttribute(
      'src',
      DATA_URL
    );
    expect(toDataURL).toHaveBeenCalledWith(data, {
      width: 120,
      margin: 1,
    });
    await expectNoA11yViolations(container);
  });

  it('has no axe violations right to left', async () => {
    const label = 'امسح لفتح هذا الملف الشخصي على هاتفك';
    const { container } = render(
      <div dir='rtl'>
        <QRCode data='https://jov.ie/tim' label={label} />
      </div>
    );
    expect(await screen.findByRole('img', { name: label })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('getQrCodeDataUrl', () => {
  it('exports an async generator for cache warm-up consumers', async () => {
    toDataURL.mockClear();
    await expect(getQrCodeDataUrl('https://jov.ie/warm', 120)).resolves.toMatch(
      /^data:/
    );
    expect(toDataURL).toHaveBeenCalledWith('https://jov.ie/warm', {
      width: 120,
      margin: 1,
    });
  });
});
