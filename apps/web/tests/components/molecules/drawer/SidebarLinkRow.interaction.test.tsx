import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/atoms/SwipeToReveal', () => ({
  SwipeToReveal: ({
    actions,
    children,
  }: {
    actions: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <div data-testid='swipe-actions'>{actions}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/lib/deep-links', () => ({
  getDSPDeepLinkConfig: vi.fn(),
  getSocialDeepLinkConfig: vi.fn(),
  openDeepLink: vi.fn(),
}));

const { SidebarLinkRow } = await import(
  '@/components/molecules/drawer/SidebarLinkRow'
);
const deepLinks = await import('@/lib/deep-links');

describe('SidebarLinkRow interactions', () => {
  it('renders label, optional badge, and supplied icon content', () => {
    render(
      <SidebarLinkRow
        icon={<span data-testid='custom-icon'>icon</span>}
        label='Portfolio'
        badge='Pinned'
        url='https://example.com/portfolio'
      />
    );

    expect(screen.getByText('Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('supports copy and open actions for a valid URL', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const openSpy = vi.fn();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'open', {
      value: openSpy,
      configurable: true,
      writable: true,
    });

    render(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>icon</span>}
        label='Portfolio'
        url='https://example.com/portfolio'
      />
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Open Portfolio' })[0]
    );
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/portfolio',
      '_blank',
      'noopener,noreferrer'
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Copy Portfolio link' })[0]
    );

    expect(writeText).toHaveBeenCalledWith('https://example.com/portfolio');
    expect(
      screen.getAllByRole('button', { name: 'Copied!' }).length
    ).toBeGreaterThan(0);
  });

  it('uses deep links when configuration exists and falls back to window.open when deep links fail', async () => {
    const user = userEvent.setup();
    const openSpy = vi.fn();
    const deepLinkConfig = { appStoreUrl: 'https://example.com/app' };

    vi.mocked(deepLinks.getDSPDeepLinkConfig).mockReturnValue(
      deepLinkConfig as never
    );
    vi.mocked(deepLinks.openDeepLink)
      .mockRejectedValueOnce(new Error('cannot open app'))
      .mockResolvedValueOnce(true);

    Object.defineProperty(globalThis, 'open', {
      value: openSpy,
      configurable: true,
      writable: true,
    });

    render(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>icon</span>}
        label='Spotify'
        url='https://example.com/music'
        deepLinkPlatform='spotify'
      />
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Open Spotify' })[0]
    );
    expect(deepLinks.openDeepLink).toHaveBeenCalledWith(
      'https://example.com/music',
      deepLinkConfig
    );
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/music',
      '_blank',
      'noopener,noreferrer'
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Open Spotify' })[0]
    );
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('supports remove action and disabled remove state', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    const { rerender } = render(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>icon</span>}
        label='Social'
        url='https://example.com/social'
        isEditable
        onRemove={onRemove}
      />
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Remove Social' })[0]
    );
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>icon</span>}
        label='Social'
        url='https://example.com/social'
        isEditable
        isRemoving
        onRemove={onRemove}
      />
    );

    for (const removeButton of screen.getAllByRole('button', {
      name: 'Remove Social',
    })) {
      expect(removeButton).toBeDisabled();
    }
  });

  it('does not render remove controls when row is not editable', () => {
    render(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>icon</span>}
        label='Social'
        url='https://example.com/social'
        onRemove={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Remove Social' })
    ).not.toBeInTheDocument();
  });

  it('disables open and copy actions when URL is empty', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const openSpy = vi.fn();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'open', {
      value: openSpy,
      configurable: true,
      writable: true,
    });

    render(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>icon</span>}
        label='Website'
        url=''
      />
    );

    const openButtons = screen.getAllByRole('button', { name: 'Open Website' });
    const copyButtons = screen.getAllByRole('button', {
      name: 'Copy Website link',
    });

    for (const openButton of openButtons) {
      expect(openButton).toBeDisabled();
      await user.click(openButton);
    }
    for (const copyButton of copyButtons) {
      expect(copyButton).toBeDisabled();
      await user.click(copyButton);
    }

    expect(openSpy).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('handles clipboard write rejections without changing to copied state', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard denied'));

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>icon</span>}
        label='Resume'
        url='https://example.com/resume'
      />
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Copy Resume link' })[0]
    );

    expect(writeText).toHaveBeenCalledWith('https://example.com/resume');
    expect(
      screen.queryByRole('button', { name: 'Copied!' })
    ).not.toBeInTheDocument();
  });
});
