import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FrostedButton } from './FrostedButton';

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

describe('FrostedButton', () => {
  it('fires onClick and forwards its ref as a button', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement | HTMLAnchorElement>();
    const { container } = render(
      <FrostedButton ref={ref} onClick={onClick}>
        Frosted action
      </FrostedButton>
    );

    const button = screen.getByRole('button', { name: 'Frosted action' });
    expect(ref.current).toBe(button);
    expect(button).toHaveClass(
      'backdrop-blur-md',
      'motion-reduce:transition-none'
    );
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('does not fire while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <FrostedButton onClick={onClick} disabled>
        Frosted action
      </FrostedButton>
    );

    await user.click(screen.getByRole('button', { name: 'Frosted action' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a partial link with the default same-tab target', async () => {
    const { container } = render(
      <FrostedButton href='/pricing'>See pricing</FrostedButton>
    );

    const link = screen.getByRole('link', { name: 'See pricing' });
    expect(link).toHaveAttribute('href', '/pricing');
    expect(link).not.toHaveAttribute('target');
    expect(link).not.toHaveAttribute('rel');
    await expectNoA11yViolations(container);
  });

  it('opens an external RTL link in a new tab and keeps a long label', async () => {
    const { container, unmount } = render(
      <div dir='rtl' lang='ar'>
        <FrostedButton href='https://example.com/ar' external tone='outline'>
          استمع الآن
        </FrostedButton>
      </div>
    );
    const link = screen.getByRole('link', { name: 'استمع الآن' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expectNoA11yViolations(container);
    unmount();

    const long = render(
      <FrostedButton>
        Continue to the release plan and every playlist pitch
      </FrostedButton>
    );
    expect(
      screen.getByRole('button', {
        name: 'Continue to the release plan and every playlist pitch',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(long.container);
  });
});
