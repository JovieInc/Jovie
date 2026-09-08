import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminCreatorsTableHeader } from './AdminCreatorsTableHeader';

type Props = React.ComponentProps<typeof AdminCreatorsTableHeader>;

function renderHeader(overrides: Partial<Props> = {}) {
  const onSortChange = vi.fn();
  const result = render(
    <table>
      <AdminCreatorsTableHeader
        sort='created_desc'
        headerCheckboxState={false}
        selectedCount={0}
        headerElevated={false}
        stickyTopPx={48}
        onToggleSelectAll={vi.fn()}
        onSortChange={onSortChange}
        {...overrides}
      />
    </table>
  );

  return { ...result, onSortChange };
}

describe('AdminCreatorsTableHeader', () => {
  it('renders bounded one-line table headings and sortable created control', () => {
    const { container, onSortChange } = renderHeader();

    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(screen.getByText('Social')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    const created = screen.getByRole('button', { name: /Created/ });
    fireEvent.click(created);
    expect(onSortChange).toHaveBeenCalledWith('created');

    const headings = Array.from(container.querySelectorAll('th'));
    expect(headings.length).toBeGreaterThan(0);
    expect(
      headings.every(heading => heading.className.includes('whitespace-nowrap'))
    ).toBe(true);
  });

  it('keeps bulk actions in the creator column without resizing headings', () => {
    const { container } = renderHeader({ selectedCount: 3 });

    expect(
      screen.getByRole('button', { name: 'Bulk actions' })
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('th')).every(heading =>
        heading.className.includes('whitespace-nowrap')
      )
    ).toBe(true);
  });
});
