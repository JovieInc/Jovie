import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ToolbarFilterSuggestions } from './ToolbarFilterSuggestions';

it('allows keyboard engagement and reserves suggestion space while the filter menu owns focus', async () => {
  const onSelect = vi.fn();
  const suggestions = [{ id: 'draft', label: 'Draft', onSelect }];
  const { rerender } = render(
    <ToolbarFilterSuggestions
      suggestions={suggestions}
      data-testid='suggestions'
    />
  );
  const button = screen.getByRole('button', { name: 'Draft' });
  await userEvent.tab();
  expect(button).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(onSelect).toHaveBeenCalledOnce();
  rerender(
    <ToolbarFilterSuggestions
      suggestions={suggestions}
      data-testid='suggestions'
      hidden
    />
  );
  expect(screen.getByTestId('suggestions')).toHaveClass(
    '!opacity-0',
    'pointer-events-none'
  );
  expect(button).toBeInTheDocument();
  expect(button).toHaveAttribute('tabindex', '-1');
});
