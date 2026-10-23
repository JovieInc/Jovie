import { Combobox as HeadlessCombobox } from '@headlessui/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComboboxDropdown } from './ComboboxDropdown';

vi.unmock('@headlessui/react');

const legacyBgWhiteClass = ['bg', 'white'].join('-');
const legacyRingWhiteClass = ['ring', 'white'].join('-');

function renderDropdown({
  isLoading = false,
  query = '',
}: {
  isLoading?: boolean;
  query?: string;
}) {
  return render(
    <HeadlessCombobox value={null} onChange={() => undefined}>
      <ComboboxDropdown
        listboxId='artist-results'
        isOpen
        isLoading={isLoading}
        query={query}
        filteredOptions={[]}
      />
    </HeadlessCombobox>
  );
}

describe('ComboboxDropdown', () => {
  it('uses the shared select/listbox overlay surface tokens', () => {
    renderDropdown({ query: 'missing' });

    const listbox = document.getElementById('artist-results')?.parentElement;
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
    expect(
      screen.getByRole('option', { name: /Searching artists/ })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders the no-results guidance after a completed search', () => {
    renderDropdown({ query: 'missing' });
    const listbox = screen.getByRole('listbox', { name: 'Artist Suggestions' });
    expect(
      screen.getByRole('option', { name: /No artists found for/ })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('option', { name: /No artists found for/ })
    ).toHaveAttribute('aria-selected', 'false');
    expect(listbox).not.toContainElement(
      screen.getByRole('link', { name: 'Verify your Spotify artist profile' })
    );
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });
});
