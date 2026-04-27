import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PillSearch } from './PillSearch';
import type { FilterPill } from './pill-search.types';

function setup(
  overrides: Partial<React.ComponentProps<typeof PillSearch>> = {}
) {
  const onPillsChange = vi.fn();
  const onClose = vi.fn();
  const props = {
    active: true,
    pills: [] as readonly FilterPill[],
    onPillsChange,
    artistOptions: ['Frank Ocean', 'Tame Impala'],
    titleOptions: ['Pyramids'],
    albumOptions: ['Blonde'],
    onClose,
    ...overrides,
  };
  const utils = render(<PillSearch {...props} />);
  return { ...utils, onPillsChange, onClose };
}

describe('PillSearch', () => {
  it('renders the search input with the empty placeholder', () => {
    setup();
    expect(
      screen.getByPlaceholderText('Type to filter — / for fields')
    ).toBeInTheDocument();
  });

  it('switches to the "and…" placeholder once a pill is present', () => {
    setup({
      pills: [{ id: '1', field: 'artist', op: 'is', values: ['Frank Ocean'] }],
    });
    expect(
      screen.getByPlaceholderText('and… (/ for fields)')
    ).toBeInTheDocument();
  });

  it('opens suggestions and commits a fuzzy artist match on Enter', () => {
    const { onPillsChange } = setup();
    const input = screen.getByLabelText('Filter tracks');
    fireEvent.change(input, { target: { value: 'frank' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPillsChange).toHaveBeenCalledOnce();
    const next = onPillsChange.mock.calls[0]![0];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      field: 'artist',
      op: 'is',
      values: ['Frank Ocean'],
    });
  });

  it('drops the last pill when Backspace is pressed on an empty input', () => {
    const { onPillsChange } = setup({
      pills: [
        { id: '1', field: 'artist', op: 'is', values: ['Frank Ocean'] },
        { id: '2', field: 'status', op: 'is', values: ['live'] },
      ],
    });
    const input = screen.getByLabelText('Filter tracks');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onPillsChange).toHaveBeenCalledOnce();
    const next = onPillsChange.mock.calls[0]![0];
    expect(next).toHaveLength(1);
    expect(next[0]!.id).toBe('1');
  });

  it('fires onClose on Escape with empty input', () => {
    const { onClose } = setup();
    const input = screen.getByLabelText('Filter tracks');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clears text on Escape when input is non-empty (without firing onClose)', () => {
    const { onClose } = setup();
    const input = screen.getByLabelText('Filter tracks') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'frank' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });
});
