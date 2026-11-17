import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { HostDrawnInput, HostDrawnSelect } from './host-drawn-field';

function SearchHarness({ note }: { readonly note: string }) {
  const [query, setQuery] = React.useState('');
  return (
    <div>
      <p>{note}</p>
      <HostDrawnInput
        aria-label='Search artist name'
        className='min-w-0 flex-1 bg-transparent'
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
    </div>
  );
}

describe('HostDrawnInput', () => {
  it('renders only the native input with the host classes, no surface of its own', () => {
    const { container } = render(
      <HostDrawnInput aria-label='Artist' className='min-w-0 flex-1' />
    );
    const input = screen.getByRole('textbox', { name: 'Artist' });
    expect(container.firstChild).toBe(input);
    expect(input.className).toBe('min-w-0 flex-1');
  });

  it('adds no class attribute when the host passes none', () => {
    render(<HostDrawnInput aria-label='Artist' />);
    expect(screen.getByRole('textbox')).not.toHaveAttribute('class');
  });

  it('hides a chip radio visually but keeps it checkable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <label>
        <HostDrawnInput
          visuallyHidden
          type='radio'
          name='role'
          value='artist'
          onChange={onChange}
        />
        Artist
      </label>
    );
    const radio = screen.getByRole('radio', { name: 'Artist' });
    expect(radio.className).toBe('sr-only');
    await user.click(screen.getByText('Artist'));
    expect(radio).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards the ref and its handlers', async () => {
    const user = userEvent.setup();
    const ref = React.createRef<HTMLInputElement>();
    const onKeyDown = vi.fn();
    render(
      <HostDrawnInput ref={ref} aria-label='Artist' onKeyDown={onKeyDown} />
    );
    expect(ref.current).toBe(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'a');
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('keeps the typed value and focus across a rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SearchHarness note='Find your artist' />);
    const input = screen.getByRole('textbox', { name: 'Search artist name' });

    await user.type(input, 'Neon');
    expect(input).toHaveValue('Neon');

    rerender(<SearchHarness note='Still searching' />);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Neon');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Neon');
    expect(input).toHaveFocus();

    fireEvent.blur(input);
    expect(input).toHaveValue('Neon');
  });
});

describe('HostDrawnSelect', () => {
  it('renders only the native select with the host stylesheet class', () => {
    const onChange = vi.fn();
    const { container } = render(
      <HostDrawnSelect
        aria-label='Select Plan To Compare'
        className='system-b-pricing-select'
        defaultValue='pro'
        onChange={onChange}
      >
        <option value='free'>Free</option>
        <option value='pro'>Pro</option>
      </HostDrawnSelect>
    );
    const select = screen.getByRole('combobox', {
      name: 'Select Plan To Compare',
    });
    expect(container.firstChild).toBe(select);
    expect(select.className).toBe('system-b-pricing-select');
    fireEvent.change(select, { target: { value: 'free' } });
    expect(select).toHaveValue('free');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('hides a result listbox visually and forwards the ref', () => {
    const ref = React.createRef<HTMLSelectElement>();
    render(
      <HostDrawnSelect
        ref={ref}
        visuallyHidden
        size={2}
        aria-label='Spotify Artist Results'
        defaultValue=''
      >
        <option value='' disabled>
          Select an artist
        </option>
        <option value='a1'>Neon Harbor</option>
      </HostDrawnSelect>
    );
    const listbox = screen.getByRole('listbox', {
      name: 'Spotify Artist Results',
    });
    expect(ref.current).toBe(listbox);
    expect(listbox.className).toBe('sr-only');
  });

  it('has no axe violations as a field, a chip radio, a select and a hidden listbox', async () => {
    const { container } = render(
      <div>
        <HostDrawnInput aria-label='Artist' placeholder='Search' />
        <HostDrawnInput aria-label='Artist link' defaultValue='Neon' disabled />
        <fieldset>
          <legend>I am a</legend>
          <label>
            <HostDrawnInput visuallyHidden type='radio' name='r' value='a' />
            Artist
          </label>
        </fieldset>
        <HostDrawnSelect aria-label='Plan' defaultValue='pro'>
          <option value='free'>Free</option>
          <option value='pro'>Pro</option>
        </HostDrawnSelect>
        <HostDrawnSelect visuallyHidden size={2} aria-label='Results'>
          <option value='a1'>Neon Harbor</option>
        </HostDrawnSelect>
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <HostDrawnInput aria-label='اسم الفنان' defaultValue='فنان' />
        <HostDrawnSelect aria-label='الخطة' defaultValue='pro'>
          <option value='pro'>احترافي</option>
        </HostDrawnSelect>
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
