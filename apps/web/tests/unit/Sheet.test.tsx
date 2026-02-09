import {
  Sheet,
  SheetClose,
  SheetContent,
  type SheetContentProps,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('Sheet', () => {
  describe('exports', () => {
    it('exports Sheet component', () => {
      expect(Sheet).toBeDefined();
    });

    it('exports SheetTrigger component', () => {
      expect(SheetTrigger).toBeDefined();
    });

    it('exports SheetContent component', () => {
      expect(SheetContent).toBeDefined();
    });

    it('exports SheetHeader component', () => {
      expect(SheetHeader).toBeDefined();
    });

    it('exports SheetTitle component', () => {
      expect(SheetTitle).toBeDefined();
    });

    it('exports SheetDescription component', () => {
      expect(SheetDescription).toBeDefined();
    });

    it('exports SheetFooter component', () => {
      expect(SheetFooter).toBeDefined();
    });

    it('exports SheetClose component', () => {
      expect(SheetClose).toBeDefined();
    });

    it('exports SheetPortal component', () => {
      expect(SheetPortal).toBeDefined();
    });

    it('exports SheetOverlay component', () => {
      expect(SheetOverlay).toBeDefined();
    });

    it('exports SheetContentProps type', () => {
      // Type test - this will fail at compile time if type isn't exported
      const props: SheetContentProps = {
        side: 'right',
      };
      expect(props).toBeDefined();
    });
  });

  describe('basic rendering', () => {
    it('renders Sheet root without errors', () => {
      expect(() => {
        render(
          <Sheet>
            <SheetTrigger>Open</SheetTrigger>
          </Sheet>
        );
      }).not.toThrow();
    });

    it('renders SheetTrigger', () => {
      render(
        <Sheet>
          <SheetTrigger>Open Sheet</SheetTrigger>
        </Sheet>
      );

      expect(screen.getByText('Open Sheet')).toBeInTheDocument();
    });

    it('SheetTrigger is accessible', () => {
      render(
        <Sheet>
          <SheetTrigger>Trigger Button</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Trigger Button');
      expect(trigger).toBeInTheDocument();
    });
  });

  describe('props acceptance', () => {
    it('Sheet accepts open prop', () => {
      expect(() => {
        render(
          <Sheet open={false}>
            <SheetTrigger>Trigger</SheetTrigger>
          </Sheet>
        );
      }).not.toThrow();
    });

    it('Sheet accepts defaultOpen prop', () => {
      expect(() => {
        render(
          <Sheet defaultOpen>
            <SheetTrigger>Trigger</SheetTrigger>
          </Sheet>
        );
      }).not.toThrow();
    });

    it('Sheet accepts onOpenChange callback', () => {
      const onOpenChange = vi.fn();
      render(
        <Sheet onOpenChange={onOpenChange}>
          <SheetTrigger>Trigger</SheetTrigger>
        </Sheet>
      );

      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('Sheet accepts modal prop', () => {
      expect(() => {
        render(
          <Sheet modal>
            <SheetTrigger>Trigger</SheetTrigger>
          </Sheet>
        );
      }).not.toThrow();
    });
  });

  describe('trigger props', () => {
    it('SheetTrigger accepts asChild prop', () => {
      render(
        <Sheet>
          <SheetTrigger asChild>
            <button type='button'>Custom Trigger</button>
          </SheetTrigger>
        </Sheet>
      );

      expect(screen.getByText('Custom Trigger')).toBeInTheDocument();
    });

    it('SheetTrigger renders as button by default', () => {
      render(
        <Sheet>
          <SheetTrigger>Default Trigger</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Default Trigger');
      expect(trigger.tagName).toBe('BUTTON');
    });

    it('accepts custom className on trigger', () => {
      render(
        <Sheet>
          <SheetTrigger className='custom-class'>Styled Trigger</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Styled Trigger');
      expect(trigger).toHaveClass('custom-class');
    });

    it('accepts disabled prop on trigger', () => {
      render(
        <Sheet>
          <SheetTrigger disabled>Disabled Trigger</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Disabled Trigger');
      expect(trigger).toBeDisabled();
    });
  });

  describe('content props', () => {
    it('SheetContent accepts side prop - right', () => {
      const props: SheetContentProps = {
        side: 'right',
      };
      expect(props.side).toBe('right');
    });

    it('SheetContent accepts side prop - left', () => {
      const props: SheetContentProps = {
        side: 'left',
      };
      expect(props.side).toBe('left');
    });

    it('SheetContent accepts side prop - top', () => {
      const props: SheetContentProps = {
        side: 'top',
      };
      expect(props.side).toBe('top');
    });

    it('SheetContent accepts side prop - bottom', () => {
      const props: SheetContentProps = {
        side: 'bottom',
      };
      expect(props.side).toBe('bottom');
    });
  });

  describe('accessibility', () => {
    it('SheetTrigger has correct button type', () => {
      render(
        <Sheet>
          <SheetTrigger>Trigger</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('type', 'button');
    });

    it('SheetTrigger has aria-expanded attribute', () => {
      render(
        <Sheet>
          <SheetTrigger>Trigger</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('aria-expanded');
    });

    it('SheetTrigger has aria-haspopup attribute', () => {
      render(
        <Sheet>
          <SheetTrigger>Trigger</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('SheetTrigger has data-state attribute', () => {
      render(
        <Sheet>
          <SheetTrigger>Trigger</SheetTrigger>
        </Sheet>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('data-state');
    });
  });

  describe('composition components', () => {
    it('renders SheetHeader', () => {
      render(
        <SheetHeader>
          <div>Header Content</div>
        </SheetHeader>
      );

      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('renders SheetTitle within Sheet context', () => {
      // SheetContent renders in portal - just verify no errors
      expect(() => {
        render(
          <Sheet>
            <SheetTrigger>Open</SheetTrigger>
            <SheetContent>
              <SheetTitle>Sheet Title</SheetTitle>
            </SheetContent>
          </Sheet>
        );
      }).not.toThrow();
    });

    it('renders SheetDescription within Sheet context', () => {
      // SheetContent renders in portal - just verify no errors
      expect(() => {
        render(
          <Sheet>
            <SheetTrigger>Open</SheetTrigger>
            <SheetContent>
              <SheetDescription>Sheet Description</SheetDescription>
            </SheetContent>
          </Sheet>
        );
      }).not.toThrow();
    });

    it('renders SheetFooter', () => {
      render(
        <SheetFooter>
          <div>Footer Content</div>
        </SheetFooter>
      );

      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('renders SheetClose', () => {
      render(
        <Sheet>
          <SheetClose>Close</SheetClose>
        </Sheet>
      );

      expect(screen.getByText('Close')).toBeInTheDocument();
    });
  });

  describe('integration with @jovie/ui', () => {
    it('components are re-exported from @jovie/ui', async () => {
      const jovieUI = await import('@jovie/ui');

      expect(Sheet).toBe(jovieUI.Sheet);
      expect(SheetTrigger).toBe(jovieUI.SheetTrigger);
      expect(SheetContent).toBe(jovieUI.SheetContent);
      expect(SheetHeader).toBe(jovieUI.SheetHeader);
      expect(SheetTitle).toBe(jovieUI.SheetTitle);
      expect(SheetDescription).toBe(jovieUI.SheetDescription);
      expect(SheetFooter).toBe(jovieUI.SheetFooter);
      expect(SheetClose).toBe(jovieUI.SheetClose);
      expect(SheetPortal).toBe(jovieUI.SheetPortal);
      expect(SheetOverlay).toBe(jovieUI.SheetOverlay);
    });
  });

  describe('composition', () => {
    it('renders complete sheet structure', () => {
      expect(() => {
        render(
          <Sheet>
            <SheetTrigger>Open</SheetTrigger>
            <SheetPortal>
              <SheetOverlay />
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Title</SheetTitle>
                  <SheetDescription>Description</SheetDescription>
                </SheetHeader>
                <div>Content</div>
                <SheetFooter>
                  <SheetClose>Close</SheetClose>
                </SheetFooter>
              </SheetContent>
            </SheetPortal>
          </Sheet>
        );
      }).not.toThrow();
    });

    it('supports controlled state', () => {
      const { rerender } = render(
        <Sheet open={false}>
          <SheetTrigger>Trigger</SheetTrigger>
        </Sheet>
      );

      expect(screen.getByText('Trigger')).toHaveAttribute(
        'data-state',
        'closed'
      );

      rerender(
        <Sheet open={true}>
          <SheetTrigger>Trigger</SheetTrigger>
        </Sheet>
      );

      expect(screen.getByText('Trigger')).toHaveAttribute('data-state', 'open');
    });

    it('renders minimal sheet with just trigger', () => {
      render(
        <Sheet>
          <SheetTrigger>Minimal Sheet</SheetTrigger>
        </Sheet>
      );

      expect(screen.getByText('Minimal Sheet')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty sheet gracefully', () => {
      expect(() => {
        render(<Sheet />);
      }).not.toThrow();
    });

    it('SheetClose accepts asChild prop', () => {
      render(
        <Sheet>
          <SheetClose asChild>
            <button type='button'>Custom Close</button>
          </SheetClose>
        </Sheet>
      );

      expect(screen.getByText('Custom Close')).toBeInTheDocument();
    });

    it('SheetClose renders as button by default', () => {
      render(
        <Sheet>
          <SheetClose>Default Close</SheetClose>
        </Sheet>
      );

      const closeButton = screen.getByText('Default Close');
      expect(closeButton.tagName).toBe('BUTTON');
    });

    it('SheetHeader accepts className', () => {
      render(<SheetHeader className='custom-header'>Header</SheetHeader>);

      const header = screen.getByText('Header');
      expect(header).toHaveClass('custom-header');
    });

    it('SheetFooter accepts className', () => {
      render(<SheetFooter className='custom-footer'>Footer</SheetFooter>);

      const footer = screen.getByText('Footer');
      expect(footer).toHaveClass('custom-footer');
    });
  });
});
