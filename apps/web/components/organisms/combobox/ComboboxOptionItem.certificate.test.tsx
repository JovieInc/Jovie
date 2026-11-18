import {
  ComboboxOptions,
  Combobox as HeadlessCombobox,
} from '@headlessui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ComboboxOptionItem } from './ComboboxOptionItem';
import type { ComboboxOption } from './types';

vi.unmock('@headlessui/react');

const option: ComboboxOption = { id: 'first-artist', name: 'First Artist' };

function renderItem(
  item: ComboboxOption,
  { selected = false, onChange = vi.fn() } = {}
) {
  const view = render(
    <HeadlessCombobox value={selected ? item : null} onChange={onChange}>
      <ComboboxOptions static aria-label='Artists'>
        <ComboboxOptionItem option={item} index={0} />
      </ComboboxOptions>
    </HeadlessCombobox>
  );
  return { ...view, onChange };
}

describe('ComboboxOptionItem certificate', () => {
  it('selects its option when clicked and shows initials without an image', async () => {
    const user = userEvent.setup();
    const { container, onChange } = renderItem(option);

    const row = screen.getByRole('option', { name: /First Artist/ });
    expect(row).toHaveAttribute('id', 'option-first-artist');
    expect(row).toHaveAttribute('data-index', '0');
    expect(screen.getByText('FA')).toBeInTheDocument();
    await user.click(row);

    expect(onChange).toHaveBeenCalledWith(option);
    await expectNoA11yViolations(container);
  });

  it('shows the check mark only when selected', async () => {
    const { container } = renderItem(option, { selected: true });

    expect(
      screen.getByTestId('combobox-option-selected-indicator')
    ).toBeInTheDocument();
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    await expectNoA11yViolations(container);
  });

  it('shimmers while the image loads, then falls back to initials on error', async () => {
    const { container } = renderItem({
      ...option,
      imageUrl: '/artist.jpg',
    });

    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(screen.queryByText('FA')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);

    expect(screen.getByText('FA')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
