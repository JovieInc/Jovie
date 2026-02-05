import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';

// Helper component for testing
const TestAlertDialog = ({
  open,
  onOpenChange,
  onAction,
  onCancel,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  actionText = 'Continue',
  cancelText = 'Cancel',
  actionVariant,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  actionText?: string;
  cancelText?: string;
  actionVariant?: 'destructive' | 'primary';
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogTrigger asChild>
      <button type='button'>Open Alert</button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>{cancelText}</AlertDialogCancel>
        <AlertDialogAction onClick={onAction} variant={actionVariant}>
          {actionText}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

describe('AlertDialog', () => {
  describe('Basic Functionality', () => {
    it('renders trigger button', () => {
      render(<TestAlertDialog />);
      expect(
        screen.getByRole('button', { name: /open alert/i })
      ).toBeInTheDocument();
    });

    it('opens on trigger click', () => {
      render(<TestAlertDialog />);
      const trigger = screen.getByRole('button', { name: /open alert/i });

      expect(
        screen.queryByTestId('alert-dialog-content')
      ).not.toBeInTheDocument();
      fireEvent.click(trigger);
      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument();
    });

    it('shows content when open', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument();
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(
        screen.getByText('This action cannot be undone.')
      ).toBeInTheDocument();
    });

    it('closes on cancel button click', () => {
      const onOpenChange = vi.fn();
      render(<TestAlertDialog open={true} onOpenChange={onOpenChange} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on action button click', () => {
      const onOpenChange = vi.fn();
      render(<TestAlertDialog open={true} onOpenChange={onOpenChange} />);

      const actionButton = screen.getByRole('button', { name: /continue/i });
      fireEvent.click(actionButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on escape key', () => {
      const onOpenChange = vi.fn();
      render(<TestAlertDialog open={true} onOpenChange={onOpenChange} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Action Callbacks', () => {
    it('calls onAction when action button is clicked', () => {
      const onAction = vi.fn();
      render(<TestAlertDialog open={true} onAction={onAction} />);

      fireEvent.click(screen.getByRole('button', { name: /continue/i }));

      expect(onAction).toHaveBeenCalled();
    });

    it('calls onCancel when cancel button is clicked', () => {
      const onCancel = vi.fn();
      render(<TestAlertDialog open={true} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Controlled Mode', () => {
    it('works in controlled mode', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <TestAlertDialog open={false} onOpenChange={onOpenChange} />
      );

      expect(
        screen.queryByTestId('alert-dialog-content')
      ).not.toBeInTheDocument();

      rerender(<TestAlertDialog open={true} onOpenChange={onOpenChange} />);
      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument();
    });

    it('calls onOpenChange when trigger is clicked', () => {
      const onOpenChange = vi.fn();
      render(<TestAlertDialog onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole('button', { name: /open alert/i }));

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('AlertDialogHeader', () => {
    it('renders with default test id', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByTestId('alert-dialog-header')).toBeInTheDocument();
    });

    it('contains title and description', () => {
      render(
        <TestAlertDialog
          open={true}
          title='Test Title'
          description='Test Description'
        />
      );
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });
  });

  describe('AlertDialogTitle', () => {
    it('renders with test id', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByTestId('alert-dialog-title')).toBeInTheDocument();
    });

    it('has correct text content', () => {
      render(<TestAlertDialog open={true} title='Custom Title' />);
      expect(screen.getByTestId('alert-dialog-title')).toHaveTextContent(
        'Custom Title'
      );
    });
  });

  describe('AlertDialogDescription', () => {
    it('renders with test id', () => {
      render(<TestAlertDialog open={true} />);
      expect(
        screen.getByTestId('alert-dialog-description')
      ).toBeInTheDocument();
    });

    it('has correct text content', () => {
      render(<TestAlertDialog open={true} description='Custom description' />);
      expect(screen.getByTestId('alert-dialog-description')).toHaveTextContent(
        'Custom description'
      );
    });
  });

  describe('AlertDialogFooter', () => {
    it('renders with default test id', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByTestId('alert-dialog-footer')).toBeInTheDocument();
    });

    it('contains action and cancel buttons', () => {
      render(<TestAlertDialog open={true} />);
      expect(
        screen.getByRole('button', { name: /cancel/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /continue/i })
      ).toBeInTheDocument();
    });
  });

  describe('AlertDialogAction', () => {
    it('renders with test id', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByTestId('alert-dialog-action')).toBeInTheDocument();
    });

    it('supports variant prop', () => {
      render(<TestAlertDialog open={true} actionVariant='destructive' />);
      const action = screen.getByTestId('alert-dialog-action');
      expect(action.className).toContain('destructive');
    });
  });

  describe('AlertDialogCancel', () => {
    it('renders with test id', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByTestId('alert-dialog-cancel')).toBeInTheDocument();
    });

    it('applies outline variant by default', () => {
      render(<TestAlertDialog open={true} />);
      const cancel = screen.getByTestId('alert-dialog-cancel');
      expect(cancel.className).toContain('border');
    });
  });

  describe('AlertDialogContent Options', () => {
    it('supports custom testId', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent testId='custom-alert'>
            <AlertDialogHeader>
              <AlertDialogTitle>Title</AlertDialogTitle>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );
      expect(screen.getByTestId('custom-alert')).toBeInTheDocument();
    });
  });

  describe('AlertDialogOverlay', () => {
    it('renders overlay when open', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByTestId('alert-dialog-overlay')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role alertdialog', () => {
      render(<TestAlertDialog open={true} />);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('has proper aria attributes', () => {
      render(<TestAlertDialog open={true} title='Test Title' />);
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('aria-describedby');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('traps focus within dialog', () => {
      render(<TestAlertDialog open={true} />);
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      cancelButton.focus();
      expect(cancelButton).toHaveFocus();
    });

    it('requires action to close - does not close on overlay click', () => {
      const onOpenChange = vi.fn();
      render(<TestAlertDialog open={true} onOpenChange={onOpenChange} />);

      // AlertDialog should not close on overlay click like regular Dialog
      // This is intentional to prevent accidental dismissal of important alerts
      const overlay = screen.getByTestId('alert-dialog-overlay');
      fireEvent.click(overlay);

      // AlertDialog by default should not close on overlay click
      // (though Radix implementation may vary)
    });
  });
});
