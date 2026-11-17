import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { JovieLogo } from './JovieLogo';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('JovieLogo certificate', () => {
  it('links home with the light tone and takes keyboard focus', async () => {
    const user = userEvent.setup();
    const { container } = render(<JovieLogo />);

    const link = screen.getByRole('link', { name: 'Jovie home' });
    expect(link).toHaveAttribute('href', '/');
    expect(link).not.toHaveAttribute('rel');
    expect(container.querySelector('svg')).toHaveClass(
      'text-tertiary-token',
      'h-6'
    );

    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('paints the dark variant and its name with the on-media token', async () => {
    const { container } = render(
      <div className='bg-base'>
        <JovieLogo variant='dark' showText size='sm' target='_blank' />
      </div>
    );

    const link = screen.getByRole('link', { name: 'Jovie home' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.querySelector('svg')).toHaveClass(
      'text-on-media',
      'hover:text-on-media/80',
      'h-4'
    );
    expect(screen.getByText('Jovie')).toHaveClass('text-on-media');
    await expectNoA11yViolations(container);
  });

  it('renders a static wordmark when it has no destination', async () => {
    const { container } = render(<JovieLogo href='' title='Jovie wordmark' />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTitle('Jovie wordmark')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long artist handle and a right-to-left layout axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <JovieLogo
          artistHandle='the-extremely-long-artist-handle-from-a-collective'
          showText
        />
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'Create your own profile with Jovie' })
    ).toHaveAttribute(
      'href',
      '/?utm_source=profile&utm_artist=the-extremely-long-artist-handle-from-a-collective'
    );
    await expectNoA11yViolations(container);
  });
});
