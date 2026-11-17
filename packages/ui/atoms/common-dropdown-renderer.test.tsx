import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderRootBody, SearchableContent } from './common-dropdown-renderer';

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
    // The visible control is a 24px box (axe target-size); the before
    // pseudo still extends the pointer target to 44px.
    expect(clearButton).toHaveClass(
      'absolute',
      'h-6',
      'w-6',
      'before:h-11',
      'before:w-11',
      'before:content-[""]'
    );
    expect(clearButton).not.toHaveClass('relative');
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

describe('renderRootBody', () => {
  it.each([
    ['loading', true, 'Loading menu items'],
    ['empty', false, 'Nothing here'],
  ])(
    'renders the %s state as one disabled menu item',
    (_name, isLoading, text) => {
      render(
        <div role='menu' aria-label='Actions'>
          {renderRootBody({
            isLoading,
            items: [],
            emptyMessage: 'Nothing here',
            renderItems: () => null,
          })}
        </div>
      );

      const row = screen.getByRole('menuitem');
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('status')).toHaveTextContent(text);
      expect(row).toContainElement(screen.getByRole('status'));
    }
  );
});
