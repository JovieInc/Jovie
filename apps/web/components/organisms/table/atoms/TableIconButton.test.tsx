import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { TableIconButton } from './TableIconButton';

describe('TableIconButton', () => {
  it('uses the canonical 40px icon control inside a 44px hit target', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <TableIconButton
        ariaLabel='More Actions'
        icon={<MoreHorizontal aria-hidden='true' />}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'More Actions' });
    expect(button).toHaveAttribute('data-size', 'icon-lg');
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveClass(
      'h-10',
      'w-10',
      'rounded-full',
      'before:h-11',
      'before:w-11',
      'overflow-visible',
      'hover:bg-interactive-hover'
    );
    expect(button.className).not.toMatch(
      /hover:(?:bg|border|text)-(?:blue|cyan|sky|indigo)/
    );
    expect(button.className).not.toMatch(/hover:(?:-?translate|scale)/);

    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps destructive table actions semantic without changing geometry', () => {
    render(
      <TableIconButton
        ariaLabel='Delete Row'
        icon={<Trash2 aria-hidden='true' />}
        onClick={() => undefined}
        variant='danger'
      />
    );

    const button = screen.getByRole('button', { name: 'Delete Row' });
    expect(button).toHaveAttribute('data-destructive', 'true');
    expect(button).toHaveAttribute('data-size', 'icon-lg');
    expect(button).toHaveClass(
      'h-10',
      'w-10',
      'before:h-11',
      'before:w-11',
      'text-error',
      'hover:bg-error-subtle',
      'hover:text-error'
    );
    expect(button.className).not.toMatch(
      /hover:(?:bg|border|text)-(?:blue|cyan|sky|indigo)/
    );
  });

  it('retains its accessible name when wrapped in the shared tooltip', () => {
    render(
      <TooltipProvider>
        <TableIconButton
          ariaLabel='More Actions'
          icon={<MoreHorizontal aria-hidden='true' />}
          onClick={() => undefined}
          tooltip='More Actions'
        />
      </TooltipProvider>
    );

    expect(
      screen.getByRole('button', { name: 'More Actions' })
    ).toBeInTheDocument();
  });
});
