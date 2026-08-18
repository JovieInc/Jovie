import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchableContent } from './common-dropdown-renderer';

describe('SearchableContent', () => {
  it('renders a semantic search field and clears without losing focus', () => {
    const onClear = vi.fn();
    render(
      <SearchableContent
        query='artist'
        placeholder='Search artists'
        onQueryChange={vi.fn()}
        onClear={onClear}
      />
    );

    const input = screen.getByRole('searchbox', { name: 'Search artists' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
  });
});
