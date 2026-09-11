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

    const input = screen.getByRole('textbox', { name: 'Search artists' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
  });

  it('keeps the compact clear affordance inside a 44px hit target', () => {
    render(
      <SearchableContent
        query='artist'
        placeholder='Search artists'
        onQueryChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton).toHaveClass(
      'h-4',
      'w-4',
      'before:h-11',
      'before:w-11',
      'before:content-[""]'
    );
  });

  it('deliberate-red: rejects the old compact-only clear target', () => {
    render(
      <button
        type='button'
        data-deliberate-red='compact-clear-target'
        className='h-4 w-4'
      />
    );

    const fixture = screen.getByRole('button');
    expect(fixture).toHaveAttribute(
      'data-deliberate-red',
      'compact-clear-target'
    );
    expect(fixture).not.toHaveClass('before:h-11', 'before:w-11');
  });
});
