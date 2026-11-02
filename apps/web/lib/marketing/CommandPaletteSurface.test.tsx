import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CommandPaletteSurface } from './CommandPaletteSurface';

function renderPalette() {
  render(<CommandPaletteSurface />);
  return {
    input: screen.getByRole('combobox', { name: 'Command Palette Search' }),
    surface: screen.getByTestId('shared-command-palette'),
  };
}

function expectSelected(input: HTMLElement, row: HTMLElement) {
  expect(row).toHaveAttribute('aria-selected', 'true');
  expect(input).toHaveAttribute('aria-activedescendant', row.id);
  expect(input).toHaveFocus();
}

describe('CommandPaletteSurface', () => {
  it.each([{ metaKey: true }, { ctrlKey: true }])(
    'selects the advertised indexed result with %j and commits only on Enter',
    modifier => {
      const { input, surface } = renderPalette();
      const rows = screen.getAllByRole('option');
      expect(within(rows[1]).getByText('⌘2')).toBeInTheDocument();

      expect(fireEvent.keyDown(input, { key: '2', ...modifier })).toBe(false);
      expectSelected(input, rows[1]);
      expect(surface).toHaveAttribute('data-committed-command', '');

      expect(fireEvent.keyDown(input, { key: '3', ...modifier })).toBe(false);
      expectSelected(input, rows[2]);
      expect(fireEvent.keyDown(input, { key: '1', ...modifier })).toBe(false);
      expectSelected(input, rows[0]);
      fireEvent.keyDown(input, { key: '2', ...modifier });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(surface).toHaveAttribute('data-committed-command', 'go-presence');
    }
  );

  it.each([
    { metaKey: true, ctrlKey: true },
    { metaKey: true, altKey: true },
    { ctrlKey: true, shiftKey: true },
    { metaKey: true, isComposing: true },
    { ctrlKey: true, keyCode: 229 },
    {},
  ])('preserves selection and browser defaults for %j', modifier => {
    const { input, surface } = renderPalette();
    const first = screen.getAllByRole('option')[0];

    expect(fireEvent.keyDown(input, { key: '2', ...modifier })).toBe(true);
    expectSelected(input, first);
    expect(surface).toHaveAttribute('data-committed-command', '');
  });

  it('respects events already handled by another owner', () => {
    const { input } = renderPalette();
    const event = new KeyboardEvent('keydown', {
      key: '2',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    fireEvent(input, event);
    expectSelected(input, screen.getAllByRole('option')[0]);
  });

  it('leaves unavailable indices and unrelated browser shortcuts alone', async () => {
    const { input, surface } = renderPalette();
    await userEvent.type(input, 'Send feedback');
    const result = screen.getByRole('option');
    expect(fireEvent.keyDown(input, { key: '2', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: '4', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'a', metaKey: true })).toBe(true);
    expectSelected(input, result);
    expect(input).toHaveValue('Send feedback');
    expect(surface).toHaveAttribute('data-committed-command', '');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(surface).toHaveAttribute('data-committed-command', 'submitFeedback');
  });

  it('keeps search, arrows, Escape and pointer selection working', async () => {
    const { input, surface } = renderPalette();
    const rows = screen.getAllByRole('option');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expectSelected(input, rows[1]);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expectSelected(input, rows[0]);
    await userEvent.type(input, 'no-matching-command');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(fireEvent.keyDown(input, { key: '1', ctrlKey: true })).toBe(true);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(surface).toHaveAttribute('data-committed-command', '');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expectSelected(input, screen.getAllByRole('option')[0]);
    fireEvent.mouseDown(screen.getAllByRole('option')[1]);
    expect(surface).toHaveAttribute('data-committed-command', 'go-presence');
    expect(input).toHaveFocus();
  });
});
