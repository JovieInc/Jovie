import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from './tooltip';
import { TooltipShortcut } from './tooltip-shortcut';

function TestTooltipShortcut({
  label,
  shortcut,
}: {
  label: string;
  shortcut?: string;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <TooltipShortcut label={label} shortcut={shortcut}>
        <button type='button'>Trigger</button>
      </TooltipShortcut>
    </TooltipProvider>
  );
}

describe('TooltipShortcut', () => {
  it('reserves shortcut slot space even when shortcut is missing (no layout shift)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestTooltipShortcut label='Go to projects' />);

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));
    await waitFor(() =>
      expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    );

    const row = screen.getByTestId('tooltip-shortcut-row');
    const slot = screen.getByTestId('tooltip-shortcut-slot');

    expect(row.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(slot.className).toContain('min-w-[2.125rem]');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('⌘P')).not.toBeInTheDocument();
  });

  it('renders keyboard shortcut in reserved slot when provided', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestTooltipShortcut label='Go to projects' shortcut='⌘P' />);

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));
    await waitFor(() =>
      expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    );

    const slot = screen.getByTestId('tooltip-shortcut-slot');
    expect(slot).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('⌘P')).toBeInTheDocument();
  });

  it('supports very long tooltip labels with safe wrapping', async () => {
    const user = userEvent.setup({ delay: null });
    const longLabel = 'superlongtooltiplabelcontent'.repeat(18);
    render(<TestTooltipShortcut label={longLabel} />);

    await user.hover(screen.getByRole('button', { name: 'Trigger' }));
    await waitFor(() =>
      expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    );

    const label = screen.getByText(longLabel);
    expect(label.className).toContain('[overflow-wrap:anywhere]');
    expect(label).toHaveTextContent(longLabel);
  });
});
