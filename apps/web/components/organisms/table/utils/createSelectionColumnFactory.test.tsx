import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CellContext, HeaderContext } from '@/lib/tanstack-v8-compat';
import { createSelectionColumnFactory } from './createSelectionColumnFactory';

type RowData = { id: string; title: string };

const rows: RowData[] = [
  { id: 'one', title: 'Cosmic Gate — EDC Set' },
  { id: 'two', title: 'Seaside Heights (Extended Mix)' },
];

function renderFactory(overrides?: Partial<Parameters<
  typeof createSelectionColumnFactory<RowData>
>[0]>) {
  const selectedIds = new Set(['one']);
  // The factory only reads `.current` at render time, so plain ref objects
  // (instead of React refs) are sufficient in this harness.
  const selectedIdsRef = { current: selectedIds };
  const headerCheckboxStateRef = {
    current: 'indeterminate' as boolean | 'indeterminate',
  };
  const toggled: string[] = [];
  let toggledAll = false;

  const { createHeaderRenderer, createCellRenderer } =
    createSelectionColumnFactory<RowData>({
      selectedIdsRef,
      headerCheckboxStateRef,
      getRowId: row => row.id,
      onToggleSelect: id => toggled.push(id),
      onToggleSelectAll: () => {
        toggledAll = true;
      },
      ...overrides,
    });

  const SelectHeader = createHeaderRenderer() as (
    props: Partial<HeaderContext<RowData, unknown>>
  ) => React.ReactElement;
  const SelectCell = createCellRenderer() as (
    props: Partial<CellContext<RowData, unknown>>
  ) => React.ReactElement;

  render(
    <table>
      <thead>
        <tr>
          <th>
            {/* Table prop is accepted for TanStack Table header parity; the
                factory renderer only reads selection state from refs. */}
            <SelectHeader
              table={
                {
                    getIsAllRowsSelected: () => false,
                    getIsAllPageRowsSelected: () => false,
                  } as never
              }
            />
          </th>
          <th>Track</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, index) => (
          <tr key={r.id}>
            <td>
              <SelectCell row={{ original: r, index, id: r.id } as never} />
            </td>
            <td>{r.title}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return { toggled, getToggledAll: () => toggledAll, selectedIds };
}

describe('createSelectionColumnFactory', () => {
  it('renders a checked checkbox for selected rows and an unchecked one otherwise', () => {
    renderFactory();

    // Radix Checkbox renders as button[role=checkbox]; state reflects in
    // aria-checked. Row numbers are 1-based (default getRowNumber).
    const checked = screen.getByRole('checkbox', { name: 'Select row 1' });
    expect(checked.getAttribute('aria-checked')).toBe('true');

    const unchecked = screen.getByRole('checkbox', { name: 'Select row 2' });
    expect(unchecked.getAttribute('aria-checked')).toBe('false');
  });

  it('renders an indeterminate header checkbox via the headerCheckboxStateRef', () => {
    renderFactory();
    expect(
      screen
        .getByRole('checkbox', { name: 'Select All Rows' })
        .getAttribute('aria-checked')
    ).toBe('mixed');
  });

  it('invokes onToggleSelect with the row id from getRowId when a row checkbox changes', () => {
    const { toggled } = renderFactory();
    const checkbox = screen.getByRole('checkbox', { name: 'Select row 2' });
    checkbox.click();
    expect(toggled).toEqual(['two']);
  });

  it('invokes onToggleSelectAll when the header checkbox changes', () => {
    const { getToggledAll } = renderFactory();
    const header = screen.getByRole('checkbox', { name: 'Select All Rows' });
    header.click();
    expect(getToggledAll()).toBe(true);
  });
});
