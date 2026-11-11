import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CircleIconButton } from './CircleIconButton';

const Glyph = () => (
  <svg aria-hidden='true' viewBox='0 0 16 16' className='h-4 w-4'>
    <circle cx='8' cy='8' r='6' />
  </svg>
);

describe('CircleIconButton: certificate states', () => {
  it('has no axe violations with only the required props', async () => {
    const { container } = render(
      <CircleIconButton ariaLabel='Open On Phone'>
        <Glyph />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Open On Phone' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('h-10', 'w-10');
    await expectNoA11yViolations(container);
  });

  it.each(['surface', 'ghost', 'frosted'] as const)(
    'has no axe violations in the %s variant',
    async variant => {
      const { container } = render(
        <CircleIconButton ariaLabel='Close' variant={variant} size='lg'>
          <Glyph />
        </CircleIconButton>
      );
      expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(
        'h-11',
        'w-11'
      );
      await expectNoA11yViolations(container);
    }
  );

  it('keeps the circle size with a long accessible name beside long copy', async () => {
    const label =
      'Open this artist profile on your phone by scanning the QR code with your camera';
    const { container } = render(
      <div className='flex w-64 items-center gap-2'>
        <span className='min-w-0 flex-1 truncate'>Long copy beside it</span>
        <CircleIconButton ariaLabel={label}>
          <Glyph />
        </CircleIconButton>
      </div>
    );
    const button = screen.getByRole('button', { name: label });
    expect(button).toHaveClass('h-10', 'w-10');
    expect(button).not.toHaveTextContent(label);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <CircleIconButton ariaLabel='افتح على الهاتف'>
          <Glyph />
        </CircleIconButton>
      </div>
    );
    expect(
      screen.getByRole('button', { name: 'افتح على الهاتف' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('runs onClick from a pointer click and from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <CircleIconButton ariaLabel='Open On Phone' onClick={onClick}>
        <Glyph />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Open On Phone' });
    await user.click(button);
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not run onClick while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <CircleIconButton ariaLabel='Open On Phone' onClick={onClick} disabled>
        <Glyph />
      </CircleIconButton>
    );
    await user.click(screen.getByRole('button', { name: 'Open On Phone' }));
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders as a labelled link with asChild and drops the button type', async () => {
    const { container } = render(
      <CircleIconButton asChild ariaLabel='Back to profile'>
        <Link href='/tim'>
          <Glyph />
        </Link>
      </CircleIconButton>
    );
    const link = screen.getByRole('link', { name: 'Back to profile' });
    expect(link).toHaveAttribute('href', '/tim');
    expect(link).not.toHaveAttribute('type');
    await expectNoA11yViolations(container);
  });
});
