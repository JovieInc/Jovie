import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NavLink } from './NavLink';

vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      {
        readonly href: string;
        readonly children: ReactNode;
        prefetch?: boolean;
      }
    >(({ href, children, prefetch: _prefetch, ...props }, ref) => (
      <a ref={ref} href={href} {...props}>
        {children}
      </a>
    )),
  };
});

describe('NavLink', () => {
  it('renders an internal link in the same tab and passes clicks through', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn(event => event.preventDefault());
    const ref = createRef<HTMLAnchorElement>();
    const { container } = render(
      <NavLink ref={ref} href='/pricing' onClick={onClick}>
        Pricing
      </NavLink>
    );

    const link = screen.getByRole('link', { name: 'Pricing' });
    expect(ref.current).toBe(link);
    expect(link).toHaveAttribute('href', '/pricing');
    expect(link).not.toHaveAttribute('target');
    await user.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('infers an external target from an absolute href', async () => {
    const { container } = render(
      <NavLink href='https://support.jov.ie'>Help center</NavLink>
    );

    const link = screen.getByRole('link', { name: 'Help center' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expectNoA11yViolations(container);
  });

  it('lets an explicit external=false keep an absolute link in the tab', () => {
    render(
      <NavLink href='https://jov.ie/pricing' external={false}>
        Pricing
      </NavLink>
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).not.toHaveAttribute(
      'target'
    );
  });

  it('keeps a long primary CTA and Arabic navigation focusable and axe-clean', async () => {
    // Primary NavLink composes Button asChild + Link (no glass twin).
    const user = userEvent.setup();
    const { container } = render(
      <nav dir='rtl' lang='ar'>
        <NavLink href='/pricing'>الأسعار</NavLink>
        <NavLink href='/signup' variant='primary'>
          Start your free workspace and claim your profile
        </NavLink>
      </nav>
    );

    await user.tab();
    expect(screen.getByRole('link', { name: 'الأسعار' })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('link', {
        name: 'Start your free workspace and claim your profile',
      })
    ).toHaveFocus();
    await expectNoA11yViolations(container);
  });
});
