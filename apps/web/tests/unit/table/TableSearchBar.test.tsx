import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableSearchBar } from '@/components/organisms/table/molecules/TableSearchBar';

describe('TableSearchBar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces outbound changes while keeping input responsive', () => {
    vi.useFakeTimers();

    const handleChange = vi.fn();

    render(
      <TableSearchBar
        value=''
        onChange={handleChange}
        debounceMs={300}
        placeholder='Search artists'
      />
    );

    const input = screen.getByPlaceholderText('Search artists');

    fireEvent.change(input, { target: { value: 'tay' } });
    expect((input as HTMLInputElement).value).toBe('tay');
    expect(handleChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('tay');
  });

  it('coalesces rapid changes into a single debounced callback', () => {
    vi.useFakeTimers();
    const handleChange = vi.fn();

    render(
      <TableSearchBar value='' onChange={handleChange} debounceMs={300} />
    );

    const input = screen.getByPlaceholderText('Search...');

    fireEvent.change(input, { target: { value: 't' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'ta' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'tay' } });
    vi.advanceTimersByTime(300);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('tay');
  });

  it('syncs to externally controlled value updates', () => {
    const handleChange = vi.fn();

    const { rerender } = render(
      <TableSearchBar value='' onChange={handleChange} />
    );

    rerender(<TableSearchBar value='drake' onChange={handleChange} />);

    const input = screen.getByPlaceholderText('Search...');
    expect((input as HTMLInputElement).value).toBe('drake');
  });
});
