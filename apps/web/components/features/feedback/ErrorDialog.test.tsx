import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorDialog } from './ErrorDialog';

describe('ErrorDialog', () => {
  it('renders the error copy and retries through the primary action', () => {
    const onPrimaryAction = vi.fn();
    render(
      <ErrorDialog
        open
        title='Upload failed'
        description='The file could not be processed.'
        onClose={vi.fn()}
        onPrimaryAction={onPrimaryAction}
      />
    );
    expect(screen.getByTestId('app-error-dialog')).toHaveTextContent(
      'Upload failed'
    );
    const primary = screen.getByTestId('error-dialog-primary-action');
    expect(primary).toHaveTextContent('Retry');
    expect(primary).toHaveClass(
      'bg-btn-primary',
      'text-btn-primary-foreground'
    );
    fireEvent.click(primary);
    expect(onPrimaryAction).toHaveBeenCalledOnce();
  });

  it('falls back to onClose for an unwired secondary action', () => {
    const onClose = vi.fn();
    render(
      <ErrorDialog
        open
        title='Upload failed'
        description='The file could not be processed.'
        onClose={onClose}
        secondaryActionLabel='Dismiss'
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalled();
  });
});
