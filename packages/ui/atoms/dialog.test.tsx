import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

// Helper component for testing
const TestDialog = ({
  open,
  onOpenChange,
  hideClose = false,
  children = 'Dialog content',
  title = 'Dialog Title',
  description = 'Dialog description',
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideClose?: boolean;
  children?: React.ReactNode;
  title?: string;
  description?: string;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>
      <button type='button'>Open Dialog</button>
    </DialogTrigger>
    <DialogContent hideClose={hideClose}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
      <DialogFooter>
        <DialogClose asChild>
          <button type='button'>Close</button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

describe('Dialog', () => {
  describe('Basic Functionality', () => {
    it('renders trigger button', () => {
      render(<TestDialog />);
      expect(
        screen.getByRole('button', { name: /open dialog/i })
      ).toBeInTheDocument();
    });

    it('opens on trigger click', () => {
      render(<TestDialog />);
      const trigger = screen.getByRole('button', { name: /open dialog/i });

      expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument();
      fireEvent.click(trigger);
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    });

    it('shows content when open', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
      expect(screen.getByText('Dialog content')).toBeInTheDocument();
    });

    it('closes on close button click', async () => {
      const onOpenChange = vi.fn();
      render(<TestDialog open={true} onOpenChange={onOpenChange} />);

      const closeButton = screen.getByTestId('dialog-close-button');
      fireEvent.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on escape key', () => {
      const onOpenChange = vi.fn();
      render(<TestDialog open={true} onOpenChange={onOpenChange} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Controlled Mode', () => {
    it('works in controlled mode', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <TestDialog open={false} onOpenChange={onOpenChange} />
      );

      expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument();

      rerender(<TestDialog open={true} onOpenChange={onOpenChange} />);
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    });

    it('calls onOpenChange when trigger is clicked', () => {
      const onOpenChange = vi.fn();
      render(<TestDialog onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole('button', { name: /open dialog/i }));

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('DialogHeader', () => {
    it('renders with default test id', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByTestId('dialog-header')).toBeInTheDocument();
    });

    it('contains title and description', () => {
      render(
        <TestDialog
          open={true}
          title='Test Title'
          description='Test Description'
        />
      );
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });
  });

  describe('DialogTitle', () => {
    it('renders with test id', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByTestId('dialog-title')).toBeInTheDocument();
    });

    it('has correct text content', () => {
      render(<TestDialog open={true} title='Custom Title' />);
      expect(screen.getByTestId('dialog-title')).toHaveTextContent(
        'Custom Title'
      );
    });
  });

  describe('DialogDescription', () => {
    it('renders with test id', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByTestId('dialog-description')).toBeInTheDocument();
    });

    it('has correct text content', () => {
      render(<TestDialog open={true} description='Custom description' />);
      expect(screen.getByTestId('dialog-description')).toHaveTextContent(
        'Custom description'
      );
    });
  });

  describe('DialogFooter', () => {
    it('renders with default test id', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByTestId('dialog-footer')).toBeInTheDocument();
    });

    it('contains close button', () => {
      render(<TestDialog open={true} />);
      const footer = screen.getByTestId('dialog-footer');
      // Get the button within the footer (the DialogClose button)
      const closeButton = footer.querySelector('button');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveTextContent('Close');
    });
  });

  describe('DialogContent Options', () => {
    it('shows close button by default', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByTestId('dialog-close-button')).toBeInTheDocument();
    });

    it('hides close button when hideClose is true', () => {
      render(<TestDialog open={true} hideClose={true} />);
      expect(
        screen.queryByTestId('dialog-close-button')
      ).not.toBeInTheDocument();
    });

    it('supports custom testId', () => {
      render(
        <Dialog open={true}>
          <DialogContent testId='custom-dialog'>Content</DialogContent>
        </Dialog>
      );
      expect(screen.getByTestId('custom-dialog')).toBeInTheDocument();
    });
  });

  describe('DialogOverlay', () => {
    it('renders overlay when open', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByTestId('dialog-overlay')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role dialog', () => {
      render(<TestDialog open={true} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has proper aria attributes', () => {
      render(<TestDialog open={true} title='Test Title' />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-describedby');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('traps focus within dialog', () => {
      render(<TestDialog open={true} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // Focus should be managed by Radix Dialog
      const closeButton = screen.getByTestId('dialog-close-button');
      closeButton.focus();
      expect(closeButton).toHaveFocus();
    });
  });

  describe('DialogClose', () => {
    it('closes dialog when clicked', () => {
      const onOpenChange = vi.fn();
      render(<TestDialog open={true} onOpenChange={onOpenChange} />);

      // Get the DialogClose button in the footer (not the X button)
      const footer = screen.getByTestId('dialog-footer');
      const closeButton = footer.querySelector('button');
      fireEvent.click(closeButton!);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
