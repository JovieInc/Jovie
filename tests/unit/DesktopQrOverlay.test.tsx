import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', async () => {
  const { createFramerMotionMock } = await import('../utils/lazy-mocks');
  return createFramerMotionMock();
});

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
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders QR code on desktop', async () => {
    render(<DesktopQrOverlay handle='tim' />);
    expect(
      await screen.findByAltText('Scan to view on mobile')
    ).toBeInTheDocument();
  });

  it('shows reopen icon after dismiss', async () => {
    render(<DesktopQrOverlay handle='tim' />);
    fireEvent.click(await screen.findByLabelText('Close'));
    expect(screen.queryByAltText('Scan to view on mobile')).toBeNull();
    expect(screen.getByLabelText('View on mobile')).toBeInTheDocument();
  });
});
