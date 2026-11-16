import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImgHTMLAttributes } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DesktopQrOverlayClient } from './DesktopQrOverlayClient';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} alt={props.alt} />
  ),
}));

function stubViewport(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: desktop,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

const QR_LABEL = 'Scan To Open This Profile On Your Phone';

// jsdom has no popover top layer: it hides every [popover] element and has
// no showPopover(). A browser shows the card once the overlay calls
// showPopover(), so this stub stands in for that open top layer by dropping
// the attribute jsdom hides it on.
const showPopover = vi.fn(function (this: HTMLElement) {
  this.removeAttribute('popover');
});

describe('DesktopQrOverlayClient', () => {
  beforeEach(() => {
    showPopover.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: showPopover,
    });
    // The overlay warms the QR image with `new Image()`; a stub keeps the
    // test off the network.
    vi.stubGlobal(
      'Image',
      class {
        src = '';
      }
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    vi.unstubAllGlobals();
  });

  it('server-renders nothing so the profile never bails out to client rendering', () => {
    stubViewport(true);
    expect(renderToString(<DesktopQrOverlayClient handle='tim' />)).toBe('');
  });

  it('stays hidden on a phone-sized viewport', async () => {
    stubViewport(false);
    const { container } = render(<DesktopQrOverlayClient handle='tim' />);
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('shows the labelled phone icon on desktop', async () => {
    stubViewport(true);
    const { container } = render(<DesktopQrOverlayClient handle='tim' />);
    expect(
      screen.getByRole('button', { name: 'Open On Phone' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: QR_LABEL })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('opens the card for this handle and closes it back to the icon', async () => {
    const user = userEvent.setup();
    stubViewport(true);
    const { container } = render(<DesktopQrOverlayClient handle='tim' />);

    await user.click(screen.getByRole('button', { name: 'Open On Phone' }));
    expect(showPopover).toHaveBeenCalledTimes(1);
    const image = screen.getByRole('img', { name: QR_LABEL });
    // The profile URL is encoded into the PNG. The src is that local data
    // URL, not a third-party request that contains the profile URL as text.
    expect(image.getAttribute('src') ?? '').toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText('Open On Phone')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('img', { name: QR_LABEL })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Open On Phone' })
    ).toBeInTheDocument();
  });

  it('keeps the card and its close control when the QR image cannot load offline', async () => {
    const user = userEvent.setup();
    stubViewport(true);
    const { container } = render(<DesktopQrOverlayClient handle='tim' />);

    await user.click(screen.getByRole('button', { name: 'Open On Phone' }));
    fireEvent.error(screen.getByRole('img', { name: QR_LABEL }));

    expect(screen.getByText('QR code unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });
});
