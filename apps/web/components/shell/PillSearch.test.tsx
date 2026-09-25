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
    expect(screen.getByPlaceholderText('Type to filter')).toBeInTheDocument();
  });

  it('uses a quiet tokenized focus ring instead of the cyan input ring', () => {
    setup();
    const input = screen.getByLabelText('Filter tracks');
    expect(input).toHaveClass('system-b-pill-search-input');
    expect(input.className).not.toContain('ring-cyan');
    expect(input.className).not.toContain('--linear');
  });

  it('keeps the route search row at a stable single-line height', () => {
    setup({
      pills: [{ id: '1', field: 'artist', op: 'is', values: ['Frank Ocean'] }],
    });

    const input = screen.getByLabelText('Filter tracks');
    const row = input.parentElement;
    const root = row?.parentElement;
    const closeButton = screen.getByRole('button', { name: 'Close Search' });

    expect(root?.className).toContain('h-full');
    expect(row?.className).toContain('h-full');
    expect(row?.className).toContain('min-h-0');
    expect(row?.className).toContain('overflow-hidden');
    expect(input).toHaveClass('system-b-pill-search-input');
    expect(closeButton).toHaveClass('system-b-pill-search-close');
    expect(closeButton.className).not.toContain('uppercase');
  });

  it('switches to the "and…" placeholder once a pill is present', () => {
    setup({
      pills: [{ id: '1', field: 'artist', op: 'is', values: ['Frank Ocean'] }],
    });
    expect(screen.getByPlaceholderText('and…')).toBeInTheDocument();
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

  it('only suggests fields allowed by the route adapter', () => {
    const { onPillsChange } = setup({ allowedFields: ['artist'] });
    const input = screen.getByLabelText('Filter tracks');

    fireEvent.change(input, { target: { value: 'Pyramids' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPillsChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Frank' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPillsChange).toHaveBeenCalledOnce();
    expect(onPillsChange.mock.calls[0]![0][0]).toMatchObject({
      field: 'artist',
      values: ['Frank Ocean'],
    });
  });

  it('uses route-provided status and has suggestions when supplied', () => {
    const { onPillsChange } = setup({
      allowedFields: ['status', 'has'],
      statusOptions: ['released', 'scheduled'],
      hasOptions: ['artwork', 'lyrics'],
    });
    const input = screen.getByLabelText('Filter tracks');

    fireEvent.change(input, { target: { value: 'released' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPillsChange).toHaveBeenCalledOnce();
    expect(onPillsChange.mock.calls[0]![0][0]).toMatchObject({
      field: 'status',
      values: ['released'],
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
