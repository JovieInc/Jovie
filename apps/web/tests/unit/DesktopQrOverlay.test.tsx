import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopQrOverlay } from '@/components/profile/DesktopQrOverlay';

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
  beforeEach(() => {
    vi.stubGlobal('matchMedia', mockMatchMedia(true));
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts as icon on desktop (hidden by default)', () => {
    render(<DesktopQrOverlay handle='tim' />);
    expect(screen.getByLabelText('View on mobile')).toBeInTheDocument();
    expect(screen.queryByAltText('Scan to view on mobile')).toBeNull();
  });

  it('opens QR code when icon is clicked', async () => {
    render(<DesktopQrOverlay handle='tim' />);
    fireEvent.click(screen.getByLabelText('View on mobile'));
    expect(
      await screen.findByAltText('Scan to view on mobile')
    ).toBeInTheDocument();
  });

  it('closes back to icon when dismiss is clicked', async () => {
    render(<DesktopQrOverlay handle='tim' />);
    fireEvent.click(screen.getByLabelText('View on mobile'));
    fireEvent.click(await screen.findByLabelText('Close'));
    expect(screen.queryByAltText('Scan to view on mobile')).toBeNull();
    expect(screen.getByLabelText('View on mobile')).toBeInTheDocument();
  });
});
