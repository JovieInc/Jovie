import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Paperclip } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PickerRow } from './picker-rows';

const item = {
  kind: 'action' as const,
  action: {
    id: 'attach',
    label: 'Attach files',
    description: 'Drop or browse',
    icon: Paperclip,
    onSelect: vi.fn(),
  },
};

function renderRow(isActive: boolean, handlers = {}) {
  return render(
    <div role='listbox' aria-label='Attachments'>
      <PickerRow
        item={item}
        index={2}
        isActive={isActive}
        onMouseEnter={vi.fn()}
        onCommit={vi.fn()}
        rowId='row-2'
        {...handlers}
      />
    </div>
  );
}

describe('PickerRow certificate', () => {
  it('marks the active row selected and is axe-clean', async () => {
    const { container } = renderRow(true);

    const option = screen.getByRole('option', { name: /Attach files/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(option).toHaveAttribute('id', 'row-2');
    await expectNoA11yViolations(container);
  });

  it('leaves an idle row unselected', async () => {
    const { container } = renderRow(false);

    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'false');
    await expectNoA11yViolations(container);
  });

  it('reports hover and commits on press without taking focus', async () => {
    const user = userEvent.setup();
    const onMouseEnter = vi.fn();
    const onCommit = vi.fn();
    renderRow(false, { onMouseEnter, onCommit });

    await user.hover(screen.getByRole('option'));
    expect(onMouseEnter).toHaveBeenCalledWith(2);

    await user.pointer({ keys: '[MouseLeft>]', target: screen.getByRole('option') });
    expect(onCommit).toHaveBeenCalledWith(2);
    expect(screen.getByRole('option')).not.toHaveFocus();
  });
});
