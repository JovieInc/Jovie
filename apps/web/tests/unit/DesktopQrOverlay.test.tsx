import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopQrOverlay } from '@/features/profile/DesktopQrOverlay';

const { DATA_URL, getQrCodeDataUrl } = vi.hoisted(() => ({
  DATA_URL: 'data:image/png;base64,QRPNG',
  getQrCodeDataUrl: vi.fn<(data: string, size: number) => Promise<string>>(
    async () => 'data:image/png;base64,QRPNG'
  ),
}));

vi.mock('@/components/molecules/QRCode', () => ({
  __esModule: true,
  // Plain <img> stand-in: the real component renders a locally generated
  // data URL, so the overlay contract under test is what it feeds the
  // generator and that no image network request is ever constructed.
  QRCode: ({
    data,
    label,
    size,
  }: Readonly<{ data: string; label?: string; size?: number }>) => (
    <img
      src={DATA_URL}
      alt={label}
      data-encoded={data}
      width={size ?? 120}
      height={size ?? 120}
    />
  ),
  getQrCodeDataUrl: (...args: unknown[]) =>
    getQrCodeDataUrl(...(args as [string, number])),
}));

function mockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation(() => ({
    matches,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('DesktopQrOverlay', () => {
  let imageSrcSetter: ReturnType<typeof vi.fn<(value: string) => void>>;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    imageSrcSetter = vi.fn();
    vi.stubGlobal(
      'Image',
      class {
        set src(value: string) {
          imageSrcSetter(value);
        }
      }
    );
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts as icon on desktop (hidden by default)', () => {
    render(<DesktopQrOverlay handle='tim' />);
    const trigger = screen.getByLabelText('Open On Phone');
    expect(trigger).toBeInTheDocument();
    expect(trigger.parentElement).toHaveClass(
      'animate-in',
      'motion-reduce:animate-none'
    );
    expect(trigger).toHaveClass('h-11', 'w-11');
    expect(
      screen.queryByAltText('Scan To Open This Profile On Your Phone')
    ).toBeNull();
  });

  it('warms the QR cache on mount once the page has loaded', () => {
    render(<DesktopQrOverlay handle='tim' />);
    expect(getQrCodeDataUrl).toHaveBeenCalledWith(
      `${globalThis.location.origin}/tim`,
      120
    );
  });

  it('constructs no Image element: QR generation makes no network request', () => {
    // The QR is generated locally from the `qrcode` dependency. The old
    // implementation preloaded an api.qrserver.com PNG, which broke the
    // profile pages' published zero-third-party-requests claim
    // (apps/web/content/comparative-claims.ts) and could hold the load
    // event for 30s+ on a slow upstream.
    render(<DesktopQrOverlay handle='tim' />);
    expect(imageSrcSetter).not.toHaveBeenCalled();
  });

  it('waits for the window load event before generating the QR', () => {
    const readyState = vi
      .spyOn(document, 'readyState', 'get')
      .mockReturnValue('loading');
    try {
      render(<DesktopQrOverlay handle='tim' />);
      expect(screen.getByLabelText('Open On Phone')).toBeInTheDocument();
      expect(getQrCodeDataUrl).not.toHaveBeenCalled();

      readyState.mockReturnValue('complete');
      act(() => {
        globalThis.dispatchEvent(new Event('load'));
      });

      expect(getQrCodeDataUrl).toHaveBeenCalledWith(
        `${globalThis.location.origin}/tim`,
        120
      );
    } finally {
      readyState.mockRestore();
    }
  });

  it('holds the QR card render until the window load event', async () => {
    // ?mode=pay opens the card at hydration; its render waits for load
    // together with the warm-up so a cold visit paints without it.
    window.history.pushState({}, '', '/testartist?mode=pay');
    const readyState = vi
      .spyOn(document, 'readyState', 'get')
      .mockReturnValue('loading');
    try {
      render(<DesktopQrOverlay handle='testartist' />);
      expect(
        screen.queryByAltText('Scan To Open This Profile On Your Phone')
      ).toBeNull();
      expect(screen.getByTestId('desktop-qr-placeholder')).toHaveStyle({
        width: '120px',
        height: '120px',
      });

      readyState.mockReturnValue('complete');
      act(() => {
        globalThis.dispatchEvent(new Event('load'));
      });

      const qr = await screen.findByAltText(
        'Scan To Open This Profile On Your Phone'
      );
      expect(qr.getAttribute('src')).toMatch(/^data:/);
      expect(qr.getAttribute('data-encoded')).toContain('testartist');
      expect(screen.queryByTestId('desktop-qr-placeholder')).toBeNull();
    } finally {
      readyState.mockRestore();
      window.history.pushState({}, '', '/');
    }
  });

  it('opens the QR code on desktop when the profile is in pay mode', async () => {
    window.history.pushState({}, '', '/testartist?mode=pay');
    render(<DesktopQrOverlay handle='testartist' />);
    const qrCode = await screen.findByAltText(
      'Scan To Open This Profile On Your Phone'
    );
    expect(qrCode.getAttribute('src')).toMatch(/^data:/);
    expect(qrCode.getAttribute('data-encoded')).toContain('testartist');
    const card = qrCode.closest('[popover="manual"]');
    expect(card).not.toBeNull();
    // The pay drawer's modal focus boundary must leave this card usable.
    expect(card).toHaveAttribute('data-modal-companion');
    window.history.pushState({}, '', '/');
  });

  it('opens QR code when icon is clicked', async () => {
    render(<DesktopQrOverlay handle='tim' />);
    fireEvent.click(screen.getByLabelText('Open On Phone'));
    const qrCode = await screen.findByAltText(
      'Scan To Open This Profile On Your Phone'
    );
    expect(qrCode).toBeInTheDocument();
    expect(qrCode.closest('.animate-in')).toHaveClass(
      'motion-reduce:animate-none'
    );
    expect(screen.getByLabelText('Close')).toHaveClass('h-11', 'w-11');
  });

  it('closes back to icon when dismiss is clicked', async () => {
    render(<DesktopQrOverlay handle='tim' />);
    fireEvent.click(screen.getByLabelText('Open On Phone'));
    fireEvent.click(await screen.findByLabelText('Close'));
    expect(
      screen.queryByAltText('Scan To Open This Profile On Your Phone')
    ).toBeNull();
    expect(screen.getByLabelText('Open On Phone')).toBeInTheDocument();
  });
});
