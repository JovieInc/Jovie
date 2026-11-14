import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Combobox, type ComboboxOption } from './Combobox';

// The shared test setup stubs Headless UI; this certificate drives the real
// combobox so open, filter and select behave as they ship.
vi.unmock('@headlessui/react');

// jsdom has no layout, so give options the scroll hook the combobox calls on
// the active row.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const options: ComboboxOption[] = [
  { id: 'one', name: 'First Artist' },
  { id: 'two', name: 'Second Artist' },
];

function renderCombobox(
  overrides: Partial<Parameters<typeof Combobox>[0]> = {}
) {
  const onChange = vi.fn();
  const onInputChange = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <Combobox
      options={options}
      value={null}
      onChange={onChange}
      onInputChange={onInputChange}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { ...view, onChange, onInputChange, onSubmit };
}

describe('Combobox (organisms re-export) certificate', () => {
  it('renders the closed search field axe-clean', async () => {
    const { container } = renderCombobox();

    expect(screen.getByLabelText('Search for an artist')).toHaveAttribute(
      'placeholder',
      'Search for an artist...'
    );
    expect(
      screen.getByRole('button', { name: 'Claim Profile for selected artist' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('reports typed text, filters options and selects one', async () => {
    const user = userEvent.setup();
    const { onChange, onInputChange } = renderCombobox();
    const input = screen.getByLabelText('Search for an artist');

    await user.type(input, 'Second');

    expect(onInputChange).toHaveBeenLastCalledWith('Second');
    expect(input).toHaveValue('Second');
    const option = await screen.findByText('Second Artist');
    expect(screen.queryByText('First Artist')).not.toBeInTheDocument();

    await user.click(option);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(options[1]));
  });

  it('submits the selected artist from the call to action', async () => {
    const user = userEvent.setup();
    const { container, onSubmit } = renderCombobox({ value: options[0] });

    expect(screen.getByText('Selected: First Artist')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Claim Profile for First Artist' })
    );

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders the loading spinner axe-clean', async () => {
    const { container } = renderCombobox({ isLoading: true });

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('announces the error message axe-clean', async () => {
    const { container } = renderCombobox({ error: 'Search is unavailable' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Search is unavailable'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps every control disabled axe-clean', async () => {
    const { container } = renderCombobox({ disabled: true });

    expect(screen.getByLabelText('Search for an artist')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Open dropdown' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});
