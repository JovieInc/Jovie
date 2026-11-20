import { Combobox as HeadlessCombobox } from '@headlessui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ComboboxDropdown } from './ComboboxDropdown';
import type { ComboboxOption } from './types';

vi.unmock('@headlessui/react');

const options: ComboboxOption[] = [
  { id: 'first', name: 'First Artist' },
  { id: 'second', name: 'Second Artist' },
];

function renderDropdown(
  props: Partial<React.ComponentProps<typeof ComboboxDropdown>> = {},
  onChange = vi.fn()
) {
  const view = render(
    <HeadlessCombobox value={null} onChange={onChange}>
      <ComboboxDropdown
        listboxId='artist-results'
        isOpen
        isLoading={false}
        query=''
        filteredOptions={[]}
        {...props}
      />
    </HeadlessCombobox>
  );
  return { ...view, onChange };
}

describe('ComboboxDropdown certificate', () => {
  it('selects the clicked suggestion', async () => {
    const user = userEvent.setup();
    const { container, onChange } = renderDropdown({
      query: 'art',
      filteredOptions: options,
    });

    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.click(screen.getByRole('option', { name: 'Second Artist' }));

    expect(onChange).toHaveBeenCalledWith(options[1]);
    await expectNoA11yViolations(container);
  });

  it('announces an active search and ignores clicks on the busy row', async () => {
    const user = userEvent.setup();
    const { container, onChange } = renderDropdown({
      isLoading: true,
      query: 'first',
    });

    expect(screen.getAllByText('Searching artists...')).toHaveLength(2);
    await user.click(screen.getByRole('option', { name: /Searching artists/ }));
    expect(onChange).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows the no-results guidance with a Spotify help link', async () => {
    const { container } = renderDropdown({ query: 'missing' });

    expect(screen.getByRole('status')).toHaveTextContent(
      'No artists found for "missing"'
    );
    const link = screen.getByRole('link', {
      name: 'Verify your Spotify artist profile',
    });
    expect(link).toHaveAttribute('href', 'https://artists.spotify.com');
    expect(link).toHaveAttribute('target', '_blank');
    await expectNoA11yViolations(container);
  });

  it('hides the panel when closed', () => {
    const { container } = renderDropdown({
      isOpen: false,
      filteredOptions: options,
    });

    expect(container.querySelector('[hidden]')).not.toBeNull();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
