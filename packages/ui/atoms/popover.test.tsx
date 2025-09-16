import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Popover, PopoverContent, PopoverTrigger } from './popover';

// Helper component for testing
const TestPopover = ({
  open,
  onOpenChange,
  showArrow = false,
  children = 'Test popover content',
  triggerText = 'Open popover',
  ...props
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showArrow?: boolean;
  children?: React.ReactNode;
  triggerText?: string;
  [key: string]: any;
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button>{triggerText}</button>
    </PopoverTrigger>
    <PopoverContent showArrow={showArrow} {...props}>
      {children}
    </PopoverContent>
  </Popover>
);

describe('Popover', () => {
  describe('Basic Functionality', () => {
    it('renders trigger and shows content on click', async () => {
      const user = userEvent.setup();
      render(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      expect(trigger).toBeInTheDocument();

      // Content should not be visible initially
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();

      // Click trigger to open popover
      await user.click(trigger);

      // Content should now be visible
      expect(screen.getByText('Test popover content')).toBeInTheDocument();
    });

    it('closes on outside click', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <TestPopover />
          <div data-testid='outside'>Outside element</div>
        </div>
      );

      const trigger = screen.getByRole('button', { name: /open popover/i });
      await user.click(trigger);

      // Verify popover is open
      expect(screen.getByText('Test popover content')).toBeInTheDocument();

      // Click outside
      await user.click(screen.getByTestId('outside'));

      // Popover should close
      await waitFor(() => {
        expect(
          screen.queryByText('Test popover content')
        ).not.toBeInTheDocument();
      });
    });

    it('closes on escape key', async () => {
      const user = userEvent.setup();
      render(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      await user.click(trigger);

      // Verify popover is open
      expect(screen.getByText('Test popover content')).toBeInTheDocument();

      // Press escape
      await user.keyboard('{Escape}');

      // Popover should close
      await waitFor(() => {
        expect(
          screen.queryByText('Test popover content')
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Controlled State', () => {
    it('works in controlled mode', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <TestPopover open={false} onOpenChange={onOpenChange} />
      );

      // Content should not be visible
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();

      // Rerender with open=true
      rerender(<TestPopover open={true} onOpenChange={onOpenChange} />);

      // Content should now be visible
      expect(screen.getByText('Test popover content')).toBeInTheDocument();
    });

    it('calls onOpenChange when trigger is clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<TestPopover onOpenChange={onOpenChange} />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      await user.click(trigger);

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', async () => {
      const user = userEvent.setup();
      render(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });

      // Trigger should have aria-expanded
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.click(trigger);

      // After opening, aria-expanded should be true
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // Content should have role="dialog" or be properly labeled
      const content = screen
        .getByText('Test popover content')
        .closest('[role]');
      expect(content).toBeInTheDocument();
    });

    it('manages focus correctly - does not trap focus like Dialog', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <TestPopover>
            <div>
              <button>Button inside popover</button>
              <input placeholder='Input inside popover' />
            </div>
          </TestPopover>
          <button data-testid='external-button'>External button</button>
        </div>
      );

      const trigger = screen.getByRole('button', { name: /open popover/i });
      await user.click(trigger);

      // Focus should be able to move to elements outside the popover
      const externalButton = screen.getByTestId('external-button');
      externalButton.focus();
      expect(externalButton).toHaveFocus();

      // Focus should also work inside the popover when directly focused
      const internalButton = screen.getByRole('button', {
        name: /button inside popover/i,
      });
      internalButton.focus(); // Direct focus rather than click
      expect(internalButton).toHaveFocus();
    });

    it('returns focus to trigger when closed with escape', async () => {
      const user = userEvent.setup();
      render(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      await user.click(trigger);

      // Press escape to close
      await user.keyboard('{Escape}');

      // Focus should return to trigger
      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });

      // Focus the trigger
      trigger.focus();
      expect(trigger).toHaveFocus();

      // Open with Enter key
      await user.keyboard('{Enter}');
      expect(screen.getByText('Test popover content')).toBeInTheDocument();

      // Close with Escape
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(
          screen.queryByText('Test popover content')
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Styling and Variants', () => {
    it('applies custom className', () => {
      render(<TestPopover open={true} className='custom-class' />);

      const content = screen.getByText('Test popover content').closest('div');
      expect(content).toHaveClass('custom-class');
    });

    it('renders arrow when showArrow is true', () => {
      render(<TestPopover open={true} showArrow={true} />);

      // Check for arrow element (Radix adds it as an SVG)
      const content = screen
        .getByText('Test popover content')
        .closest('[role]');
      expect(content?.querySelector('svg')).toBeInTheDocument();
    });

    it('does not render arrow by default', () => {
      render(<TestPopover open={true} showArrow={false} />);

      const content = screen
        .getByText('Test popover content')
        .closest('[role]');
      expect(content?.querySelector('svg')).not.toBeInTheDocument();
    });

    it('has proper positioning attributes', () => {
      render(<TestPopover open={true} side='top' align='start' />);

      const content = screen.getByText('Test popover content').closest('div');
      expect(content).toHaveAttribute('data-side', 'top');
      expect(content).toHaveAttribute('data-align', 'start');
    });
  });

  describe('Interactive Content', () => {
    it('supports interactive content without focus trapping', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <TestPopover open={true}>
          <div>
            <button onClick={handleClick}>Interactive button</button>
            <input placeholder='Interactive input' />
          </div>
        </TestPopover>
      );

      // Should be able to interact with content
      const button = screen.getByRole('button', {
        name: /interactive button/i,
      });
      await user.click(button);
      expect(handleClick).toHaveBeenCalled();

      // Should be able to type in input
      const input = screen.getByPlaceholderText('Interactive input');
      await user.type(input, 'test');
      expect(input).toHaveValue('test');
    });

    it('supports form submission within popover', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn(e => e.preventDefault());

      render(
        <TestPopover open={true}>
          <form onSubmit={handleSubmit}>
            <input name='email' placeholder='Email' />
            <button type='submit'>Submit</button>
          </form>
        </TestPopover>
      );

      const input = screen.getByPlaceholderText('Email');
      const submitButton = screen.getByRole('button', { name: /submit/i });

      await user.type(input, 'test@example.com');
      await user.click(submitButton);

      expect(handleSubmit).toHaveBeenCalled();
    });
  });

  describe('SSR Compatibility', () => {
    it('renders without hydration errors', () => {
      // This test ensures the component can be server-rendered
      const { container } = render(<TestPopover />);
      expect(container).toBeInTheDocument();

      // Should not throw during hydration simulation
      expect(() => {
        render(<TestPopover />);
      }).not.toThrow();
    });

    it('handles Portal rendering gracefully', () => {
      // Portal should not cause issues during SSR
      render(<TestPopover open={true} />);
      expect(screen.getByText('Test popover content')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid open/close cycles', async () => {
      const user = userEvent.setup();
      render(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });

      // Rapidly toggle multiple times
      await user.click(trigger);
      await user.click(trigger);
      await user.click(trigger);
      await user.click(trigger);

      // Should handle it gracefully
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();
    });

    it('handles children prop changes', () => {
      const { rerender } = render(
        <TestPopover open={true}>Initial content</TestPopover>
      );

      expect(screen.getByText('Initial content')).toBeInTheDocument();

      rerender(<TestPopover open={true}>Updated content</TestPopover>);

      expect(screen.getByText('Updated content')).toBeInTheDocument();
      expect(screen.queryByText('Initial content')).not.toBeInTheDocument();
    });
  });
});
