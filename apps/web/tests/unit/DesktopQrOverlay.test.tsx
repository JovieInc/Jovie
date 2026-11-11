import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopQrOverlay } from '@/features/profile/DesktopQrOverlay';

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

  it('preloads the QR image URL on mount once the page has loaded', () => {
    render(<DesktopQrOverlay handle='tim' />);
    expect(imageSrcSetter).toHaveBeenCalledWith(
      expect.stringContaining(
        encodeURIComponent(`${globalThis.location.origin}/tim`)
      )
    );
  });

  it('waits for the window load event before fetching the third-party QR image', () => {
    // A slow api.qrserver.com response must never hold the profile's load
    // event: the product crawl saw /[username] time out at 30s on desktop.
    const readyState = vi
      .spyOn(document, 'readyState', 'get')
      .mockReturnValue('loading');
    try {
      render(<DesktopQrOverlay handle='tim' />);
      expect(screen.getByLabelText('Open On Phone')).toBeInTheDocument();
      expect(imageSrcSetter).not.toHaveBeenCalled();

      readyState.mockReturnValue('complete');
      act(() => {
        globalThis.dispatchEvent(new Event('load'));
      });

      expect(imageSrcSetter).toHaveBeenCalledWith(
        expect.stringContaining('api.qrserver.com')
      );
    } finally {
      readyState.mockRestore();
    }
  });

  it('holds the pay-mode QR <img> until the window load event', async () => {
    // ?mode=pay opens the card at hydration; its <img> must not fetch
    // api.qrserver.com before load either, or it holds the load event.
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

      expect(
        await screen.findByAltText('Scan To Open This Profile On Your Phone')
      ).toHaveAttribute('src', expect.stringContaining('api.qrserver.com'));
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
    expect(qrCode).toHaveAttribute(
      'src',
      expect.stringContaining('api.qrserver.com')
    );
    expect(qrCode.getAttribute('src')).toContain('testartist');
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
