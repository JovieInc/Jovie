import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BulkDeleteCreatorDialog } from './BulkDeleteCreatorDialog';

function renderDialog(count: number) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  const view = render(
    <BulkDeleteCreatorDialog
      open
      count={count}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
  return { ...view, onOpenChange, onConfirm };
}

describe('BulkDeleteCreatorDialog certificate', () => {
  it('names a plural selection and confirms the delete', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(3);

    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete 3 creators?',
    });
    expect(dialog).toHaveAccessibleDescription(
      'This will permanently delete the selected creator profiles. This action cannot be undone.'
    );
    await expectNoA11yViolations(document.body);

    await user.click(screen.getByRole('button', { name: 'Delete Profiles' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses singular copy for one creator and cancels by closing', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onConfirm } = renderDialog(1);

    expect(
      screen.getByRole('alertdialog', { name: 'Delete 1 creator?' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete Profile' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(document.body);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog(2);

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays axe-clean for a large selection inside an RTL document', async () => {
    render(
      <div dir='rtl' lang='ar'>
        <BulkDeleteCreatorDialog
          open
          count={12_480}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
        />
      </div>
    );

    expect(
      screen.getByRole('alertdialog', { name: 'Delete 12480 creators?' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });
});
