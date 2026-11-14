import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  ] as const)(
    'renders the %s label from the canonical variant',
    (variant, label) => {
      render(<NavBadge variant={variant} />);

      const badge = screen.getByText(label);
      expect(badge).toBeVisible();
      expect(badge).toHaveAttribute('data-nav-badge', variant);
      expect(badge).toHaveClass('h-4');
    }
  );
});

describe('NavBadge accessibility', () => {
  it.each([
    ['a count', <NavBadge key='badge' variant='count' count={3} />],
    ['a zero count', <NavBadge key='badge' variant='count' count={0} />],
    [
      'an overflowing count',
      <NavBadge key='badge' variant='count' count='99+' />,
    ],
    ['the Pro label', <NavBadge key='badge' variant='pro' />],
    ['the New label', <NavBadge key='badge' variant='new' />],
    [
      'a labelled count',
      <NavBadge
        key='badge'
        variant='count'
        count={12}
        aria-label='12 unread chats'
      />,
    ],
  ])('has no axe violations for %s', async (_label, badge) => {
    const { container } = render(<Link href='/app/chat'>Chats {badge}</Link>);
    await expectNoA11yViolations(container);
  });

  it('keeps an Arabic-digit count intact in a right-to-left rail', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Link href='/app/chat'>
          المحادثات <NavBadge variant='count' count='٣' />
        </Link>
      </div>
    );
    expect(screen.getByText('٣')).toHaveAttribute('data-nav-badge', 'count');
    await expectNoA11yViolations(container);
  });
});
