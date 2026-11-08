import { Button } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from './Dialog';

function TestDialog({
  onClose = vi.fn(),
  hideClose = false,
  size = 'lg' as const,
  className,
}: {
  readonly onClose?: () => void;
  readonly hideClose?: boolean;
  readonly size?: React.ComponentProps<typeof Dialog>['size'];
  readonly className?: string;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      hideClose={hideClose}
      size={size}
      className={className}
    >
      <DialogTitle>Confirm changes</DialogTitle>
      <DialogDescription>Review the details before saving.</DialogDescription>
      <DialogBody data-testid='body'>Dialog body</DialogBody>
      <DialogActions>
        <Button variant='outline'>Cancel</Button>
        <Button>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

describe('Dialog compatibility adapter', () => {
  it('uses canonical surface anatomy while preserving app layout slots', () => {
    render(<TestDialog />);

    const content = screen.getByRole('dialog');
    expect(content).toHaveClass(
      'sm:max-w-lg',
      'gap-0',
      'border-default',
      'bg-surface-elevated',
      'rounded-(--system-b-radius-panel)'
    );
    expect(content).not.toHaveClass(
      'rounded-dialog',
      'border-(--app-shell-frame-seam)',
      'bg-(--app-shell-content-surface)'
    );

    expect(screen.getByTestId('body')).toHaveAttribute(
      'data-slot',
      'dialog-body'
    );
    expect(screen.getByTestId('body')).toHaveClass('mt-5', 'min-w-0');

    const actions = screen.getByTestId('dialog-footer');
    expect(actions).toHaveAttribute('data-slot', 'dialog-footer');
    expect(actions).toHaveClass(
      'flex',
      'flex-col-reverse',
      'sm:flex-row',
      'mt-6',
      'gap-3',
      'pt-0',
      '*:w-full',
      'sm:*:w-auto'
    );
  });

  it('preserves size and custom class overrides', () => {
    render(<TestDialog size='2xl' className='custom-dialog-class' />);
    expect(screen.getByRole('dialog')).toHaveClass(
      'sm:max-w-2xl',
      'custom-dialog-class'
    );
  });

  it('calls onClose only when the controlled dialog requests dismissal', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can hide the canonical close control', () => {
    render(<TestDialog hideClose />);
    expect(screen.queryByTestId('dialog-close-button')).not.toBeInTheDocument();
  });

  it('has no axe violations in the default state', async () => {
    const { baseElement } = render(<TestDialog />);
    await expectNoA11yViolations(baseElement);
  });

  it('keeps an empty body in its slot without axe violations', async () => {
    const { baseElement } = render(
      <Dialog open onClose={vi.fn()} size='md'>
        <DialogTitle>Import releases</DialogTitle>
        <DialogDescription>Nothing has been added yet.</DialogDescription>
        <DialogBody data-testid='empty-body' />
        <DialogActions>
          <Button variant='outline'>Done</Button>
        </DialogActions>
      </Dialog>
    );

    expect(screen.getByTestId('empty-body')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });

  it('names a title-only dialog and closes it from the close control', async () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <Dialog open onClose={onClose} size='sm'>
        <DialogTitle>Saving your changes</DialogTitle>
      </Dialog>
    );

    expect(
      screen.getByRole('dialog', { name: 'Saving your changes' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);

    fireEvent.click(screen.getByTestId('dialog-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('wraps long content without axe violations', async () => {
    const longTitle =
      'Transfer ownership of the Midnight Sessions Vol. 2 (Deluxe Extended Anniversary Edition) release and every linked smart link';
    const { baseElement } = render(
      <Dialog open onClose={vi.fn()} size='md'>
        <DialogTitle>{longTitle}</DialogTitle>
        <DialogDescription>
          The new owner receives full control of the release, its 48 tracks, all
          pre-save campaigns, every smart link and the fan contact list.
        </DialogDescription>
        <DialogBody>
          <p>
            https://jov.ie/midnightsessions/midnight-sessions-vol-2-deluxe-extended-anniversary-edition-remastered
          </p>
        </DialogBody>
        <DialogActions>
          <Button variant='outline'>Keep ownership of this release</Button>
          <Button variant='destructive'>
            Transfer release and all smart links
          </Button>
        </DialogActions>
      </Dialog>
    );

    expect(screen.getByRole('dialog', { name: longTitle })).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });

  it('renders right-to-left slots without axe violations', async () => {
    const { baseElement } = render(
      <div dir='rtl'>
        <Dialog open onClose={vi.fn()} size='md'>
          <DialogTitle dir='rtl'>تعديل الملف الشخصي للفنان</DialogTitle>
          <DialogDescription dir='rtl'>
            تظهر هذه التغييرات فورًا على صفحتك العامة.
          </DialogDescription>
          <DialogBody dir='rtl' data-testid='rtl-body'>
            رابط الإصدار
          </DialogBody>
          <DialogActions dir='rtl'>
            <Button variant='outline'>إلغاء</Button>
            <Button>حفظ التغييرات</Button>
          </DialogActions>
        </Dialog>
      </div>
    );

    expect(screen.getByTestId('rtl-body')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByTestId('dialog-footer')).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(baseElement);
  });
});
