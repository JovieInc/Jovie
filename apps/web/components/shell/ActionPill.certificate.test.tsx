import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActionPill } from './ActionPill';

describe('ActionPill certificate', () => {
  it('calls onClick once per press, axe-clean', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <ActionPill label='New release' icon={Plus} onClick={onClick} />
    );
    await user.click(screen.getByRole('button', { name: 'New release' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('activates from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ActionPill label='New release' onClick={onClick} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'New release' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a label-only pill without a handler as a plain button', async () => {
    const { container } = render(<ActionPill label='New release' />);
    const button = screen.getByRole('button', { name: 'New release' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('svg')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('submits its form when typed as submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <ActionPill label='Save' type='submit' />
      </form>
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps long and RTL labels axe-clean', async () => {
    const long = 'Schedule a new release for every connected storefront';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ActionPill label={long} icon={Plus} />
        <ActionPill label='إصدار جديد' icon={Plus} />
      </div>
    );
    expect(screen.getByRole('button', { name: long })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'إصدار جديد' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
