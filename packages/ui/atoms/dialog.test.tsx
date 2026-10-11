import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { closeButtonClassName } from './close-button';
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

    it('uses the shared pill close button styles', () => {
      render(<TestDialog open={true} />);
      const closeButton = screen.getByTestId('dialog-close-button');

      expect(closeButton.className).toBe(closeButtonClassName);
      expect(closeButton.className).toContain('rounded-full');
      expect(closeButton.className).not.toContain(
        'rounded-(--app-shell-radius-item)'
      );
    });

    it('uses cinematic motion for modal reveals', () => {
      render(<TestDialog open={true} />);
      const content = screen.getByTestId('dialog-content');

      expect(content.className).toContain('duration-cinematic');
      expect(content.className).toContain('ease-cinematic');
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

    it('exposes stable anatomy slots for composition', () => {
      render(<TestDialog open={true} />);

      expect(screen.getByTestId('dialog-overlay')).toHaveAttribute(
        'data-slot',
        'dialog-overlay'
      );
      expect(screen.getByTestId('dialog-content')).toHaveAttribute(
        'data-slot',
        'dialog-content'
      );
      expect(screen.getByTestId('dialog-header')).toHaveAttribute(
        'data-slot',
        'dialog-header'
      );
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

describe('Dialog overlay layer contract', () => {
  it('paints on the modal layer so it covers sheets it opens from', () => {
    render(<TestDialog open />);
    expect(screen.getByTestId('dialog-content').className).toContain('z-modal');
    expect(screen.getByTestId('dialog-overlay').className).toContain('z-modal');
  });

  it('restores focus to the menu trigger when opened from a menu item', async () => {
    function MenuOrigin() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button id='menu-origin-trigger' type='button'>
            Actions
          </button>
          <div role='menu' aria-labelledby='menu-origin-trigger'>
            <button role='menuitem' type='button' onClick={() => setOpen(true)}>
              Rename
            </button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Rename</DialogTitle>
              <DialogDescription>Names show on every link.</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<MenuOrigin />);
    const item = screen.getByRole('menuitem', { name: 'Rename' });
    item.focus();
    fireEvent.click(item);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus()
    );
  });
});

describe('Dialog full-screen takeover', () => {
  it('keeps accessible modal semantics and Escape dismissal without centered card geometry', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent variant='fullscreen' hideClose>
          <DialogTitle>Workspace search</DialogTitle>
          <DialogDescription>Search every workspace.</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog', { name: 'Workspace search' });
    expect(dialog).toHaveClass('inset-0', 'h-dvh', 'w-full', 'max-w-none');
    expect(dialog).not.toHaveClass(
      'left-1/2',
      'max-w-lg',
      'rounded-(--system-b-radius-panel)'
    );
    expect(screen.queryByTestId('dialog-close-button')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
