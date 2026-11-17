import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableSearchBar } from './TableSearchBar';

describe('TableSearchBar', () => {
  it('keeps typed text and reports it once the debounce settles', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <TableSearchBar value='' onChange={onChange} debounceMs={20} />
    );

    const input = screen.getByRole('searchbox', { name: 'Search...' });
    await user.type(input, 'midnight');
    expect(input).toHaveValue('midnight');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('midnight'));
    await expectNoA11yViolations(container);
  });

  it('clears the query from the clear button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TableSearchBar value='tour' onChange={onChange} debounceMs={20} />);

    const input = screen.getByRole('searchbox', { name: 'Search...' });
    expect(input).toHaveValue('tour');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(''));
  });

  it('follows an external value change', async () => {
    const { rerender } = render(
      <TableSearchBar
        value=''
        onChange={vi.fn()}
        placeholder='Search releases'
      />
    );

    rerender(
      <TableSearchBar
        value='summer'
        onChange={vi.fn()}
        placeholder='Search releases'
      />
    );
    expect(
      await screen.findByRole('searchbox', { name: 'Search releases' })
    ).toHaveValue('summer');
  });

  it('stays axe-clean with an RTL query', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <TableSearchBar value='' onChange={vi.fn()} placeholder='بحث' />
      </div>
    );

    const input = screen.getByRole('searchbox', { name: 'بحث' });
    await user.type(input, 'ليلى');
    expect(input).toHaveValue('ليلى');
    await expectNoA11yViolations(container);
  });
});
