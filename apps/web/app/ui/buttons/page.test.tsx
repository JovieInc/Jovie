// Drift T2.1: buttons showcase covers IconButton table-row demos after
// TableIconButton alias delete (exact-head coverage on changed lines).
import { TooltipProvider } from '@jovie/ui';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ButtonsPage from './page';

describe('ButtonsPage showcase', () => {
  it('renders IconButton table-row demos instead of TableIconButton', () => {
    render(
      <TooltipProvider>
        <ButtonsPage />
      </TooltipProvider>
    );

    const tableRowStack = screen.getByText('IconButton (table row)').closest(
      'div'
    );
    expect(tableRowStack).not.toBeNull();
    const stack = within(tableRowStack as HTMLElement);
    expect(stack.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(stack.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByText('TableIconButton')).not.toBeInTheDocument();
  });
});
