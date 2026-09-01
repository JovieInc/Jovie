import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ComboboxDropdown } from './ComboboxDropdown';

const legacyBgWhiteClass = ['bg', 'white'].join('-');
const legacyRingWhiteClass = ['ring', 'white'].join('-');

vi.mock('@headlessui/react', () => ({
  ComboboxOptions: ({
    children,
    static: _static,
    ...props
  }: {
    children: ReactNode;
    static?: boolean;
  }) => <div {...props}>{children}</div>,
}));

function renderDropdown({
  isLoading = false,
  query = '',
}: {
  isLoading?: boolean;
  query?: string;
}) {
  return render(
    <ComboboxDropdown
      listboxId='artist-results'
      isOpen
      isLoading={isLoading}
      query={query}
      filteredOptions={[]}
    />
  );
}

describe('ComboboxDropdown', () => {
  it('uses the shared select/listbox overlay surface tokens', () => {
    renderDropdown({ query: 'missing' });

    const listbox = document.getElementById('artist-results');
    expect(listbox?.className).toContain('rounded-(--system-b-radius-overlay)');
    expect(listbox?.className).toContain('bg-surface-elevated');
    expect(listbox?.className).toContain('border-default');
    expect(listbox?.className).not.toContain(legacyBgWhiteClass);
    expect(listbox?.className).not.toContain(legacyRingWhiteClass);
  });

  it('renders the canonical spinner for an active search', () => {
    renderDropdown({ isLoading: true, query: 'first' });

    expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute(
      'data-tone',
      'primary'
    );
    expect(screen.getByText('Searching artists...')).toBeInTheDocument();
  });

  it('renders the no-results guidance after a completed search', () => {
    renderDropdown({ query: 'missing' });
    expect(screen.getByText(/No artists found for/)).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });
});
