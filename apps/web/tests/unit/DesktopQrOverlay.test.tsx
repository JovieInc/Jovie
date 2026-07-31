import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByLabelText('Open On Phone')).toBeInTheDocument();
    expect(
      screen.queryByAltText('Scan To Open This Profile On Your Phone')
    ).toBeNull();
  });

  it('preloads the QR image URL on mount', () => {
    render(<DesktopQrOverlay handle='tim' />);
    expect(imageSrcSetter).toHaveBeenCalledWith(
      expect.stringContaining(
        encodeURIComponent(`${globalThis.location.origin}/tim`)
      )
    );
  });

  it('opens QR code when icon is clicked', async () => {
    render(<DesktopQrOverlay handle='tim' />);
    fireEvent.click(screen.getByLabelText('Open On Phone'));
    expect(
      await screen.findByAltText('Scan To Open This Profile On Your Phone')
    ).toBeInTheDocument();
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
