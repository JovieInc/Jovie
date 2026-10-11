import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarFilterSuggestions } from '@/components/organisms/table/molecules/ToolbarFilterSuggestions';

describe('ToolbarFilterSuggestions', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(
      <ToolbarFilterSuggestions data-testid='suggestions' suggestions={[]} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders one button per suggestion and calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(
      <ToolbarFilterSuggestions
        data-testid='suggestions'
        suggestions={[
          { id: 'status-draft', label: 'Status · Draft', onSelect },
          { id: 'type-releases', label: 'Type · Releases', onSelect: vi.fn() },
        ]}
      />
    );

    const draft = screen.getByRole('button', { name: 'Status · Draft' });
    expect(draft).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Type · Releases' })
    ).toBeInTheDocument();

    fireEvent.click(draft);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('sits at opacity 0 by default and only reveals on the toolbar-filters hover/focus group', () => {
    render(
      <ToolbarFilterSuggestions
        data-testid='suggestions'
        suggestions={[{ id: 'a', label: 'Status · Draft', onSelect: vi.fn() }]}
      />
    );

    const row = screen.getByTestId('suggestions');
    expect(row.className).toContain('opacity-0');
    expect(row.className).toContain('group-hover/toolbar-filters:opacity-100');
    expect(row.className).toContain(
      'group-focus-within/toolbar-filters:opacity-100'
    );
    expect(row).not.toHaveAttribute('aria-hidden');

    const pill = screen.getByRole('button', { name: 'Status · Draft' });
    expect(pill).toHaveAttribute('tabindex', '0');
  });

  it('hides without unmounting while the filter dropdown is open, and removes pills from tab order', () => {
    render(
      <ToolbarFilterSuggestions
        data-testid='suggestions'
        hidden
        suggestions={[{ id: 'a', label: 'Status · Draft', onSelect: vi.fn() }]}
      />
    );

    const row = screen.getByTestId('suggestions');
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row.className).toContain('pointer-events-none');
    // Still mounted (reserves layout space) — only opacity/interactivity
    // change. `aria-hidden` on the ancestor removes it from the default
    // accessibility-tree query, so opt into the inaccessible node with
    // `hidden: true` to assert it wasn't unmounted.
    const pill = screen.getByRole('button', {
      name: 'Status · Draft',
      hidden: true,
    });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('tabindex', '-1');
  });
});
