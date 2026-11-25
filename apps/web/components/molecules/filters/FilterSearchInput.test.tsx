// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterSearchInput } from './FilterSearchInput';

describe('FilterSearchInput', () => {
  it('renders a clear control when the query is non-empty', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FilterSearchInput value='alpha' onChange={vi.fn()} onClear={onClear} />
    );
    await user.click(screen.getByRole('button', { name: 'Clear Search' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
