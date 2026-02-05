import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

// Helper component for testing
const TestSheet = ({
  open,
  onOpenChange,
  side = 'right',
  hideClose = false,
  children = 'Sheet content',
  title = 'Sheet Title',
  description = 'Sheet description',
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  hideClose?: boolean;
  children?: React.ReactNode;
  title?: string;
  description?: string;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetTrigger asChild>
      <button type='button'>Open Sheet</button>
    </SheetTrigger>
    <SheetContent side={side} hideClose={hideClose}>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      {children}
      <SheetFooter>
        <SheetClose asChild>
          <button type='button'>Close</button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

describe('Sheet', () => {
  describe('Basic Functionality', () => {
    it('renders trigger button', () => {
      render(<TestSheet />);
      expect(
        screen.getByRole('button', { name: /open sheet/i })
      ).toBeInTheDocument();
    });

    it('opens on trigger click', () => {
      render(<TestSheet />);
      const trigger = screen.getByRole('button', { name: /open sheet/i });

      expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument();
      fireEvent.click(trigger);
      expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
    });

    it('shows content when open', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
      expect(screen.getByText('Sheet content')).toBeInTheDocument();
    });

    it('closes on close button click', () => {
      const onOpenChange = vi.fn();
      render(<TestSheet open={true} onOpenChange={onOpenChange} />);

      const closeButton = screen.getByTestId('sheet-close-button');
      fireEvent.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on escape key', () => {
      const onOpenChange = vi.fn();
      render(<TestSheet open={true} onOpenChange={onOpenChange} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Side Variants', () => {
    it('renders on right side by default', () => {
      render(<TestSheet open={true} />);
      const content = screen.getByTestId('sheet-content');
      expect(content.className).toContain('right-0');
    });

    it('renders on left side', () => {
      render(<TestSheet open={true} side='left' />);
      const content = screen.getByTestId('sheet-content');
      expect(content.className).toContain('left-0');
    });

    it('renders on top side', () => {
      render(<TestSheet open={true} side='top' />);
      const content = screen.getByTestId('sheet-content');
      expect(content.className).toContain('top-0');
    });

    it('renders on bottom side', () => {
      render(<TestSheet open={true} side='bottom' />);
      const content = screen.getByTestId('sheet-content');
      expect(content.className).toContain('bottom-0');
    });
  });

  describe('Controlled Mode', () => {
    it('works in controlled mode', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <TestSheet open={false} onOpenChange={onOpenChange} />
      );

      expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument();

      rerender(<TestSheet open={true} onOpenChange={onOpenChange} />);
      expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
    });

    it('calls onOpenChange when trigger is clicked', () => {
      const onOpenChange = vi.fn();
      render(<TestSheet onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole('button', { name: /open sheet/i }));

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('SheetHeader', () => {
    it('renders with default test id', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByTestId('sheet-header')).toBeInTheDocument();
    });

    it('contains title and description', () => {
      render(
        <TestSheet
          open={true}
          title='Test Title'
          description='Test Description'
        />
      );
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });
  });

  describe('SheetTitle', () => {
    it('renders with test id', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByTestId('sheet-title')).toBeInTheDocument();
    });

    it('has correct text content', () => {
      render(<TestSheet open={true} title='Custom Title' />);
      expect(screen.getByTestId('sheet-title')).toHaveTextContent(
        'Custom Title'
      );
    });
  });

  describe('SheetDescription', () => {
    it('renders with test id', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByTestId('sheet-description')).toBeInTheDocument();
    });

    it('has correct text content', () => {
      render(<TestSheet open={true} description='Custom description' />);
      expect(screen.getByTestId('sheet-description')).toHaveTextContent(
        'Custom description'
      );
    });
  });

  describe('SheetFooter', () => {
    it('renders with default test id', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByTestId('sheet-footer')).toBeInTheDocument();
    });

    it('contains close button', () => {
      render(<TestSheet open={true} />);
      const footer = screen.getByTestId('sheet-footer');
      // Get the button within the footer (the SheetClose button)
      const closeButton = footer.querySelector('button');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveTextContent('Close');
    });
  });

  describe('SheetContent Options', () => {
    it('shows close button by default', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByTestId('sheet-close-button')).toBeInTheDocument();
    });

    it('hides close button when hideClose is true', () => {
      render(<TestSheet open={true} hideClose={true} />);
      expect(
        screen.queryByTestId('sheet-close-button')
      ).not.toBeInTheDocument();
    });

    it('supports custom testId', () => {
      render(
        <Sheet open={true}>
          <SheetContent testId='custom-sheet'>Content</SheetContent>
        </Sheet>
      );
      expect(screen.getByTestId('custom-sheet')).toBeInTheDocument();
    });
  });

  describe('SheetOverlay', () => {
    it('renders overlay when open', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByTestId('sheet-overlay')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role dialog', () => {
      render(<TestSheet open={true} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has proper aria attributes', () => {
      render(<TestSheet open={true} title='Test Title' />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-describedby');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });

  describe('SheetClose', () => {
    it('closes sheet when clicked', () => {
      const onOpenChange = vi.fn();
      render(<TestSheet open={true} onOpenChange={onOpenChange} />);

      // Get the SheetClose button in the footer (not the X button)
      const footer = screen.getByTestId('sheet-footer');
      const closeButton = footer.querySelector('button');
      fireEvent.click(closeButton!);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(<TestSheet open={true} />);
      const content = screen.getByTestId('sheet-content');
      expect(content.className).toContain('fixed');
      expect(content.className).toContain('z-50');
      expect(content.className).toContain('bg-surface-2');
    });

    it('applies animation classes', () => {
      render(<TestSheet open={true} />);
      const content = screen.getByTestId('sheet-content');
      expect(content.className).toContain('transition');
    });
  });
});
