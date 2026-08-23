import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TableIconButton } from './TableIconButton';

const icon = <svg aria-hidden='true' data-testid='table-action-icon' />;

describe('TableIconButton', () => {
  it('attaches the table action API to the canonical icon-button contract', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TableIconButton
        ariaLabel='Copy row'
        className='custom-table-action'
        icon={icon}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Copy row' });
    expect(button).toHaveAttribute('data-size', 'icon-lg');
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveClass('h-10', 'w-10', 'custom-table-action');
    expect(button.className).toContain('before:h-11');
    expect(button.className).toContain('before:w-11');
    expect(screen.getByTestId('table-action-icon')).toBeInTheDocument();

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('preserves the danger API through the canonical destructive variant', () => {
    render(
      <TableIconButton
        ariaLabel='Delete row'
        icon={icon}
        onClick={vi.fn()}
        variant='danger'
      />
    );

    const button = screen.getByRole('button', { name: 'Delete row' });
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-destructive', 'true');
    expect(button).toHaveClass('bg-error', 'h-10', 'w-10');
    expect(button.className).toContain('overflow-visible');
  });
});
