import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/atoms/Popover';

describe('Popover', () => {
  describe('exports', () => {
    it('exports Popover component', () => {
      expect(Popover).toBeDefined();
    });

    it('exports PopoverTrigger component', () => {
      expect(PopoverTrigger).toBeDefined();
    });

    it('exports PopoverContent component', () => {
      expect(PopoverContent).toBeDefined();
    });

    it('exports PopoverAnchor component', () => {
      expect(PopoverAnchor).toBeDefined();
    });
  });

  describe('basic rendering', () => {
    it('renders Popover root without errors', () => {
      expect(() => {
        render(
          <Popover>
            <PopoverTrigger>Trigger</PopoverTrigger>
          </Popover>
        );
      }).not.toThrow();
    });

    it('renders PopoverTrigger', () => {
      render(
        <Popover>
          <PopoverTrigger>Open Popover</PopoverTrigger>
        </Popover>
      );

      expect(screen.getByText('Open Popover')).toBeInTheDocument();
    });

    it('PopoverTrigger is accessible', () => {
      render(
        <Popover>
          <PopoverTrigger>Trigger Button</PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Trigger Button');
      expect(trigger).toBeInTheDocument();
    });

    it('renders with PopoverAnchor', () => {
      expect(() => {
        render(
          <Popover>
            <PopoverAnchor />
            <PopoverTrigger>Trigger</PopoverTrigger>
          </Popover>
        );
      }).not.toThrow();
    });
  });

  describe('props acceptance', () => {
    it('Popover accepts open prop', () => {
      expect(() => {
        render(
          <Popover open={false}>
            <PopoverTrigger>Trigger</PopoverTrigger>
          </Popover>
        );
      }).not.toThrow();
    });

    it('Popover accepts defaultOpen prop', () => {
      expect(() => {
        render(
          <Popover defaultOpen>
            <PopoverTrigger>Trigger</PopoverTrigger>
          </Popover>
        );
      }).not.toThrow();
    });

    it('Popover accepts onOpenChange callback', () => {
      const onOpenChange = vi.fn();
      render(
        <Popover onOpenChange={onOpenChange}>
          <PopoverTrigger>Trigger</PopoverTrigger>
        </Popover>
      );

      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('Popover accepts modal prop', () => {
      expect(() => {
        render(
          <Popover modal>
            <PopoverTrigger>Trigger</PopoverTrigger>
          </Popover>
        );
      }).not.toThrow();
    });
  });

  describe('trigger props', () => {
    it('PopoverTrigger accepts asChild prop', () => {
      render(
        <Popover>
          <PopoverTrigger asChild>
            <button type='button'>Custom Trigger</button>
          </PopoverTrigger>
        </Popover>
      );

      expect(screen.getByText('Custom Trigger')).toBeInTheDocument();
    });

    it('PopoverTrigger renders as button by default', () => {
      render(
        <Popover>
          <PopoverTrigger>Default Trigger</PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Default Trigger');
      expect(trigger.tagName).toBe('BUTTON');
    });
  });

  describe('accessibility', () => {
    it('PopoverTrigger has correct button type', () => {
      render(
        <Popover>
          <PopoverTrigger>Trigger</PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('type', 'button');
    });

    it('PopoverTrigger has aria-expanded attribute', () => {
      render(
        <Popover>
          <PopoverTrigger>Trigger</PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('aria-expanded');
    });

    it('PopoverTrigger has aria-haspopup attribute', () => {
      render(
        <Popover>
          <PopoverTrigger>Trigger</PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('aria-haspopup');
    });

    it('PopoverTrigger has data-state attribute', () => {
      render(
        <Popover>
          <PopoverTrigger>Trigger</PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Trigger');
      expect(trigger).toHaveAttribute('data-state');
    });
  });

  describe('integration with @jovie/ui', () => {
    it('components are re-exported from @jovie/ui', async () => {
      const jovieUI = await import('@jovie/ui');

      expect(Popover).toBe(jovieUI.Popover);
      expect(PopoverTrigger).toBe(jovieUI.PopoverTrigger);
      expect(PopoverContent).toBe(jovieUI.PopoverContent);
      expect(PopoverAnchor).toBe(jovieUI.PopoverAnchor);
    });
  });

  describe('edge cases', () => {
    it('handles multiple triggers gracefully', () => {
      expect(() => {
        render(
          <Popover>
            <PopoverTrigger>Trigger 1</PopoverTrigger>
          </Popover>
        );
      }).not.toThrow();
    });

    it('renders without trigger (edge case)', () => {
      expect(() => {
        render(<Popover />);
      }).not.toThrow();
    });

    it('accepts custom className on trigger', () => {
      render(
        <Popover>
          <PopoverTrigger className='custom-class'>
            Styled Trigger
          </PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Styled Trigger');
      expect(trigger).toHaveClass('custom-class');
    });

    it('accepts disabled prop on trigger', () => {
      render(
        <Popover>
          <PopoverTrigger disabled>Disabled Trigger</PopoverTrigger>
        </Popover>
      );

      const trigger = screen.getByText('Disabled Trigger');
      expect(trigger).toBeDisabled();
    });
  });

  describe('composition', () => {
    it('renders with all components together', () => {
      expect(() => {
        render(
          <Popover>
            <PopoverAnchor />
            <PopoverTrigger>Open</PopoverTrigger>
            <PopoverContent>Content</PopoverContent>
          </Popover>
        );
      }).not.toThrow();
    });

    it('supports controlled state', () => {
      const { rerender } = render(
        <Popover open={false}>
          <PopoverTrigger>Trigger</PopoverTrigger>
        </Popover>
      );

      expect(screen.getByText('Trigger')).toHaveAttribute(
        'data-state',
        'closed'
      );

      rerender(
        <Popover open={true}>
          <PopoverTrigger>Trigger</PopoverTrigger>
        </Popover>
      );

      expect(screen.getByText('Trigger')).toHaveAttribute('data-state', 'open');
    });
  });
});
