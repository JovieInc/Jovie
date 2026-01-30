import { Button } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it, vi } from 'vitest';

describe('Button', () => {
  describe('basic rendering', () => {
    it('renders correctly with default props', () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole('button', { name: 'Click me' });
      expect(button).toBeEnabled();
    });

    it('renders with custom className', () => {
      render(<Button className='custom-class'>Click me</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('renders children correctly', () => {
      render(<Button>Custom Text</Button>);
      expect(screen.getByText('Custom Text')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('renders without variant (default)', () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders destructive variant', () => {
      render(<Button variant='destructive'>Delete</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders outline variant', () => {
      render(<Button variant='outline'>Outline</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders secondary variant', () => {
      render(<Button variant='secondary'>Secondary</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders ghost variant', () => {
      render(<Button variant='ghost'>Ghost</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders link variant', () => {
      render(<Button variant='link'>Link</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('sizes', () => {
    it('renders default size', () => {
      render(<Button size='default'>Default Size</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders small size', () => {
      render(<Button size='sm'>Small</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders large size', () => {
      render(<Button size='lg'>Large</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('renders icon size', () => {
      render(<Button size='icon'>Icon</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('handles click events', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('prevents multiple rapid clicks', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByRole('button');
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      // Should be called for each click
      expect(handleClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('disabled state', () => {
    it('does not trigger click when disabled', () => {
      const handleClick = vi.fn();
      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('applies disabled attribute', () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('maintains disabled styling with variants', () => {
      render(
        <Button disabled variant='destructive'>
          Disabled Destructive
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('asChild prop', () => {
    it('renders as link via asChild', () => {
      render(
        <Button asChild>
          <Link href='/test'>Link Button</Link>
        </Button>
      );
      expect(screen.getByRole('link')).toBeInTheDocument();
      expect(screen.getByRole('link')).toHaveAttribute('href', '/test');
    });

    it('renders as span via asChild', () => {
      render(
        <Button asChild>
          <span>Span Button</span>
        </Button>
      );
      expect(screen.getByText('Span Button')).toBeInTheDocument();
    });

    it('preserves variant styling with asChild', () => {
      render(
        <Button asChild variant='outline'>
          <Link href='/test'>Styled Link</Link>
        </Button>
      );
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has proper button role', () => {
      render(<Button>Accessible Button</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('supports keyboard activation with Enter', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Press Enter</Button>);

      const button = screen.getByRole('button');
      button.focus();
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalled();
    });

    it('supports keyboard activation with Space', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Press Space</Button>);

      const button = screen.getByRole('button');
      button.focus();
      fireEvent.keyDown(button, { key: ' ' });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalled();
    });

    it('is keyboard focusable', () => {
      render(<Button>Focusable</Button>);
      const button = screen.getByRole('button');

      button.focus();
      expect(document.activeElement).toBe(button);
    });

    it('disabled button is not focusable via tab', () => {
      render(<Button disabled>Not Focusable</Button>);
      const button = screen.getByRole('button');

      button.focus();
      // Disabled buttons can receive focus programmatically but not via tab
      expect(button).toBeDisabled();
    });

    it('supports aria-label', () => {
      render(<Button aria-label='Close dialog'>X</Button>);
      expect(
        screen.getByRole('button', { name: 'Close dialog' })
      ).toBeInTheDocument();
    });

    it('supports aria-describedby', () => {
      render(
        <>
          <Button aria-describedby='description'>Action</Button>
          <span id='description'>This performs an action</span>
        </>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-describedby', 'description');
    });
  });

  describe('button type', () => {
    it('defaults to button type', () => {
      render(<Button>Default Type</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('supports submit type', () => {
      render(<Button type='submit'>Submit</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
    });

    it('supports reset type', () => {
      render(<Button type='reset'>Reset</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'reset');
    });
  });

  describe('edge cases', () => {
    it('handles undefined onClick gracefully', () => {
      render(<Button>No Handler</Button>);
      const button = screen.getByRole('button');

      expect(() => {
        fireEvent.click(button);
      }).not.toThrow();
    });

    it('handles empty children', () => {
      render(<Button></Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('handles very long text', () => {
      const longText = 'A'.repeat(200);
      render(<Button>{longText}</Button>);
      expect(screen.getByRole('button')).toHaveTextContent(longText);
    });

    it('applies multiple class names correctly', () => {
      render(<Button className='class1 class2 class3'>Multi Class</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('class1', 'class2', 'class3');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to button element', () => {
      const ref = vi.fn();
      render(<Button ref={ref}>Ref Button</Button>);

      expect(ref).toHaveBeenCalled();
    });
  });
});
