import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavBadge } from './NavBadge';

describe('NavBadge', () => {
  it('renders a count with stable tabular geometry and accessible metadata', () => {
    render(
      <NavBadge
        variant='count'
        count={12}
        aria-label='12 unread chats'
        className='ml-2'
      />
    );

    const badge = screen.getByLabelText('12 unread chats');
    expect(badge).toHaveTextContent('12');
    expect(badge).toHaveClass('tabular-nums');
    expect(badge).toHaveClass('min-w-4');
    expect(badge).toHaveClass('ml-2');
  });

  it.each([
    ['pro', 'Pro'],
    ['new', 'New'],
  ] as const)('renders the %s label from the canonical variant', (variant, label) => {
    render(<NavBadge variant={variant} />);

    const badge = screen.getByText(label);
    expect(badge).toBeVisible();
    expect(badge).toHaveAttribute('data-nav-badge', variant);
    expect(badge).toHaveClass('h-4');
  });
});
