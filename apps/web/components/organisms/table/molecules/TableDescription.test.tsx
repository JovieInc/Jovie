import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableDescription } from './TableDescription';

describe('TableDescription', () => {
  it('keeps complete notes available by keyboard without expanding or selecting the row', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const text =
      'A long description with important details beyond the two-line preview.';
    render(
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <TableDescription text={text} label='Hosting notes' />
            </td>
          </tr>
        </tbody>
      </table>
    );
    const trigger = screen.getByRole('button', {
      name: 'Read full Hosting notes',
    });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Hosting notes' });
    expect(dialog).toHaveTextContent(text);
    expect(onRowClick).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('does not render a disclosure for empty notes', () => {
    render(<TableDescription text='' label='Notes' />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
