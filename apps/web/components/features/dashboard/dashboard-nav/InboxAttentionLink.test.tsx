import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InboxAttentionLink } from './InboxAttentionLink';

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

describe('InboxAttentionLink', () => {
  it('links to the Inbox without prefetching and caps the pending badge', () => {
    render(
      <InboxAttentionLink
        label='Inbox'
        itemId='home'
        attention='available'
        pendingCount={140}
      />
    );
    const link = screen.getByRole('link', { name: 'Inbox' });
    expect(link).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(link).toHaveAttribute('data-prefetch', 'false');
    expect(link).toHaveAttribute('data-inbox-attention', 'available');
    expect(link).toHaveAttribute('data-navigation-item-id', 'home');
    expect(
      screen.getByRole('status', { name: '140 pending items' })
    ).toHaveTextContent('99');
  });

  it('shows the update dot only when nothing is pending', () => {
    const { rerender } = render(
      <InboxAttentionLink
        label='Inbox'
        itemId='home'
        attention='available'
        runtimeUpdate
      />
    );
    expect(
      document.querySelector('[data-inbox-runtime-update]')
    ).toBeInTheDocument();
    rerender(
      <InboxAttentionLink
        label='Inbox'
        itemId='home'
        attention='available'
        runtimeUpdate
        pendingCount={2}
      />
    );
    expect(document.querySelector('[data-inbox-runtime-update]')).toBeNull();
  });

  it('acknowledges a pending navigation and forwards clicks', () => {
    const onClick = vi.fn(event => event.preventDefault());
    render(
      <InboxAttentionLink
        label='Inbox'
        itemId='home'
        attention='empty'
        navigationPending
        onClick={onClick}
      />
    );
    const link = screen.getByRole('link', { name: 'Inbox' });
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('data-navigation-pending', 'true');
    expect(link).toHaveClass('bg-sidebar-accent-active');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['empty', { attention: 'empty' }],
    ['partial', { attention: 'unknown' }],
    ['pending', { attention: 'available', pendingCount: 3 }],
    ['long content', { attention: 'available', pendingCount: 140 }],
    ['update available', { attention: 'available', runtimeUpdate: true }],
    ['navigation pending', { attention: 'empty', navigationPending: true }],
  ] as const)('has no accessibility violations when %s', async (_, props) => {
    const { container } = render(
      <InboxAttentionLink label='Inbox' itemId='home' {...props} />
    );
    await expectNoA11yViolations(container);
  });
});
