// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeaderSearchAction } from './HeaderSearchAction';

describe('HeaderSearchAction', () => {
  it('opens the search field from the icon control', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <HeaderSearchAction
          searchValue=''
          onSearchValueChange={onChange}
          placeholder='Search'
          ariaLabel='Search field'
          submitAriaLabel='Open search'
          tooltipLabel='Search'
        />
      </TooltipProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Open search' }));
    expect(screen.getByLabelText('Search field')).toBeInTheDocument();
  });
});
