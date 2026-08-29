import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableIconButton } from './TableIconButton';

function renderButton(
  props: Partial<ComponentProps<typeof TableIconButton>> = {}
) {
  const { onClick = vi.fn(), ariaLabel = 'Row action', ...rest } = props;
  return {
    onClick,
    ...render(
      <TooltipProvider delayDuration={0}>
        <TableIconButton
          icon={<svg aria-hidden='true' data-testid='table-icon' />}
          onClick={onClick}
          ariaLabel={ariaLabel}
          {...rest}
        />
      </TooltipProvider>
    ),
  };
}

describe('TableIconButton', () => {
  it('delegates icon-only geometry and the 44px hit target to IconButton', () => {
    renderButton();

    const button = screen.getByRole('button', { name: 'Row action' });
    expect(button).toHaveAttribute('data-size', 'icon-lg');
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button.className).toContain('h-10');
    expect(button.className).toContain('w-10');
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('overflow-visible');
    expect(button.className).toContain('before:h-11');
    expect(button.className).toContain('before:w-11');
    expect(button.className).toContain('focus-visible:ring-focus/55');
    expect(button.className).toContain('hover:bg-interactive-hover');
    expect(button.className).not.toContain('rounded-md');
    expect(button.className).not.toContain('rounded-sm');
    expect(button.className).not.toMatch(
      /hover:(?:bg|border|text)-(?:blue|cyan|sky|indigo)/
    );
    expect(button.className).not.toMatch(/hover:(?:-?translate|scale)/);
    expect(screen.getByTestId('table-icon')).toBeInTheDocument();
  });

  it('maps danger onto the shared destructive Button state', () => {
    renderButton({ variant: 'danger', ariaLabel: 'Delete row' });

    const button = screen.getByRole('button', { name: 'Delete row' });
    expect(button).toHaveAttribute('data-destructive', 'true');
    expect(button.className).toContain('text-error');
    expect(button.className).toContain('hover:bg-error-subtle');
    expect(button.className).toContain('before:h-11');
    expect(button.className).not.toMatch(
      /hover:(?:bg|border|text)-(?:blue|cyan|sky|indigo)/
    );
  });

  it('exposes an accessible name and activates from pointer and keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderButton({ onClick, ariaLabel: 'Copy link' });

    const button = screen.getByRole('button', { name: 'Copy link' });
    await user.click(button);
    await user.tab();
    button.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('keeps the accessible name when a tooltip is provided', () => {
    renderButton({ tooltip: 'Copy shareable URL', ariaLabel: 'Copy URL' });

    expect(
      screen.getByRole('button', { name: 'Copy URL' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Copy shareable URL')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderButton({ ariaLabel: 'Open row settings' });
    await expectNoA11yViolations(container);
  });
});
