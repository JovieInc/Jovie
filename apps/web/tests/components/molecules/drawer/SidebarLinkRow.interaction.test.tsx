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

const { SidebarLinkRow } = await import(
  '@/components/molecules/drawer/SidebarLinkRow'
);

describe('SidebarLinkRow interactions', () => {
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
        icon={<span aria-hidden='true'>🔗</span>}
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

  it('supports remove action and disabled remove state', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    const { rerender } = render(
      <SidebarLinkRow
        icon={<span aria-hidden='true'>🗑️</span>}
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
        icon={<span aria-hidden='true'>🗑️</span>}
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
        icon={<span aria-hidden='true'>🚫</span>}
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
        icon={<span aria-hidden='true'>📋</span>}
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
