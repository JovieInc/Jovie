import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerBackButton } from './DrawerBackButton';

describe('DrawerBackButton certificate', () => {
  it('calls onClick from pointer and keyboard, axe-clean', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <DrawerBackButton label='Back to artist' onClick={onClick} />
    );

    const back = screen.getByRole('button', { name: 'Back to artist' });
    await user.click(back);
    back.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('truncates a long label and keeps it as the accessible name', async () => {
    const label = 'Back to the artist release workspace and every draft';
    const { container } = render(<DrawerBackButton label={label} />);

    expect(screen.getByText(label)).toHaveClass('truncate', 'max-w-50');
    expect(screen.getByRole('button', { name: label })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DrawerBackButton label='Back' onClick={onClick} disabled />);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders an Arabic label inside an RTL drawer', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DrawerBackButton label='العودة إلى الفنان' />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'العودة إلى الفنان' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
