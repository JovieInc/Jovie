import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CelebrationCardPreview } from './CelebrationCardPreview';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

function setShare(share: unknown) {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: share,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setShare(undefined);
});

describe('CelebrationCardPreview', () => {
  it('switches the card size with the picker, sizes the image and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    const { container } = render(
      <CelebrationCardPreview
        username='sashawaves'
        onInteraction={onInteraction}
      />
    );
    const image = screen.getByAltText('Your shareable profile card');
    expect(image).toHaveAttribute('width', '1080');
    expect(image).toHaveAttribute('height', '1080');
    expect(image).toHaveClass('h-auto');
    await user.click(screen.getByRole('button', { name: /Story/ }));
    expect(screen.getByAltText('Your shareable profile card')).toHaveAttribute(
      'height',
      '1920'
    );
    expect(screen.getByAltText('Your shareable profile card')).toHaveAttribute(
      'src',
      expect.stringContaining('size=story')
    );
    expect(onInteraction).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders the size picker with PlainButton chrome and no palette classes', () => {
    render(<CelebrationCardPreview username='sashawaves' />);
    const picker = screen.getByRole('button', { name: /Square/ });
    expect(picker).toHaveAttribute('data-slot', 'plain-button');
    expect(picker).toHaveClass('bg-btn-primary');
  });

  it('downloads the card and reports the interaction', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    const fetchMock = vi.fn(async () => ({
      blob: async () => new Blob(['png']),
    }));
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:card');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(
      <CelebrationCardPreview
        username='sashawaves'
        onInteraction={onInteraction}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('download=1')
    );
    expect(onInteraction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card')
    );
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('keeps the button usable when the download fails offline', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const { container } = render(
      <CelebrationCardPreview username='sashawaves' />
    );
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(
      await screen.findByRole('button', { name: 'Download' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('shares through the native sheet when available and hides Share otherwise', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {});
    setShare(share);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['png']) }))
    );
    const first = render(<CelebrationCardPreview username='sashawaves' />);
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://jov.ie/sashawaves' })
    );
    first.unmount();
    setShare(undefined);
    render(<CelebrationCardPreview username='sashawaves' />);
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('renders empty, long and right-to-left usernames axe-clean', async () => {
    const empty = render(<CelebrationCardPreview username='' />);
    await expectNoA11yViolations(empty.container);
    empty.unmount();
    const rtl = render(<CelebrationCardPreview username='فرقة-منتصف-الليل' />);
    await expectNoA11yViolations(rtl.container);
  });
});
