import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/components/feedback', () => ({
  toast: { error: toastError, success: vi.fn() },
}));

import { DrawerEditableTextField } from './DrawerEditableTextField';

function Field({
  onSave,
  tick,
}: {
  readonly onSave: (value: string | null) => Promise<void>;
  readonly tick: number;
}) {
  return (
    <div data-tick={tick}>
      <DrawerEditableTextField
        label='Display name'
        value='Nova'
        editable
        onSave={onSave}
      />
    </div>
  );
}

describe('DrawerEditableTextField certificate', () => {
  it('keeps the typed draft and focus across a parent rerender', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(<Field onSave={onSave} tick={0} />);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /Nova/ }));
    const input = screen.getByRole('textbox', { name: 'Edit Display name' });
    await user.clear(input);
    await user.type(input, 'Nova Live');
    rerender(<Field onSave={onSave} tick={1} />);

    expect(input).toHaveValue('Nova Live');
    expect(input).toHaveFocus();
    await expectNoA11yViolations(container);

    await user.keyboard('{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('textbox', { name: 'Edit Display name' })
    ).not.toBeInTheDocument();
  });

  it('reports a rejected save with an error toast', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValue(new Error('Display name could not be saved'));
    render(<Field onSave={onSave} tick={0} />);

    await user.click(screen.getByRole('button', { name: /Nova/ }));
    const input = screen.getByRole('textbox', { name: 'Edit Display name' });
    await user.clear(input);
    await user.type(input, 'Nova Live{Enter}');

    expect(onSave).toHaveBeenCalledWith('Nova Live');
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Display name could not be saved')
    );
  });

  it('renders a read-only RTL value without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerEditableTextField label='الاسم المعروض' value='نوفا' />
      </div>
    );
    expect(screen.getByText('نوفا')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
