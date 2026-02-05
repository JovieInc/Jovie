import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Input } from './input';

describe('Input', () => {
  describe('Basic Rendering', () => {
    it('renders with default props', () => {
      render(<Input placeholder='Enter text' />);
      const input = screen.getByPlaceholderText('Enter text');
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe('INPUT');
    });

    it('renders with type text by default', () => {
      render(<Input data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('type', 'text');
    });

    it('supports different input types', () => {
      const { rerender } = render(<Input type='email' data-testid='input' />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'email');

      rerender(<Input type='password' data-testid='input' />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'password');

      rerender(<Input type='number' data-testid='input' />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'number');
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('has correct displayName', () => {
      expect(Input.displayName).toBe('Input');
    });
  });

  describe('Variants and Sizes', () => {
    it('applies default variant classes', () => {
      render(<Input data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('border-default');
      expect(input.className).toContain('bg-surface-1');
    });

    it('applies error variant classes', () => {
      render(<Input variant='error' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('border-destructive');
    });

    it('applies success variant classes', () => {
      render(<Input variant='success' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('border-green-500');
    });

    it('applies sm size classes', () => {
      render(<Input inputSize='sm' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('h-8');
      expect(input.className).toContain('text-xs');
    });

    it('applies md size classes by default', () => {
      render(<Input data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('h-10');
      expect(input.className).toContain('text-sm');
    });

    it('applies lg size classes', () => {
      render(<Input inputSize='lg' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('h-12');
      expect(input.className).toContain('text-base');
    });

    it('supports size prop as alias for inputSize', () => {
      render(<Input size='lg' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('h-12');
    });

    it('merges custom className', () => {
      render(<Input className='custom-class' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('custom-class');
      expect(input.className).toContain('border-default');
    });
  });

  describe('States', () => {
    it('respects disabled state', () => {
      render(<Input disabled data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input).toBeDisabled();
    });

    it('shows loading state with spinner', () => {
      render(<Input loading data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute('aria-busy', 'true');
    });

    it('disables input when loading', () => {
      render(<Input loading data-testid='input' />);
      expect(screen.getByTestId('input')).toBeDisabled();
    });
  });

  describe('Label and Help Text', () => {
    it('renders with label', () => {
      render(<Input label='Email' />);
      expect(screen.getByText('Email')).toBeInTheDocument();
      const input = screen.getByRole('textbox');
      expect(input).toHaveAccessibleName('Email');
    });

    it('renders required indicator with label', () => {
      render(<Input label='Email' required />);
      expect(screen.getByText('*')).toBeInTheDocument();
      expect(screen.getByText('(required)')).toBeInTheDocument();
    });

    it('renders help text', () => {
      render(<Input helpText='Enter your email address' />);
      expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    });

    it('associates help text with input via aria-describedby', () => {
      render(<Input helpText='Help text' data-testid='input' />);
      const input = screen.getByTestId('input');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('renders error message', () => {
      render(<Input error='Invalid email' />);
      const errorMessage = screen.getByText('Invalid email');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveAttribute('role', 'alert');
    });

    it('applies error variant when error prop is provided', () => {
      render(<Input error='Invalid email' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('border-destructive');
    });

    it('sets aria-invalid when error is present', () => {
      render(<Input error='Invalid email' data-testid='input' />);
      expect(screen.getByTestId('input')).toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    it('associates error message with input via aria-describedby', () => {
      render(<Input error='Invalid email' data-testid='input' />);
      const input = screen.getByTestId('input');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
    });
  });

  describe('Validation State', () => {
    it('applies invalid validation state', () => {
      render(<Input validationState='invalid' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('border-destructive');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('applies valid validation state', () => {
      render(<Input validationState='valid' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input.className).toContain('border-green-500');
    });

    it('applies pending validation state', () => {
      render(<Input validationState='pending' data-testid='input' />);
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Trailing Content', () => {
    it('renders status icon', () => {
      render(
        <Input
          statusIcon={<span data-testid='status-icon'>✓</span>}
          data-testid='input'
        />
      );
      expect(screen.getByTestId('status-icon')).toBeInTheDocument();
    });

    it('renders trailing content', () => {
      render(
        <Input
          trailing={<button type='button'>Clear</button>}
          data-testid='input'
        />
      );
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    it('hides status icon when loading', () => {
      render(
        <Input
          loading
          statusIcon={<span data-testid='status-icon'>✓</span>}
          data-testid='input'
        />
      );
      expect(screen.queryByTestId('status-icon')).not.toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('handles value change', () => {
      render(<Input data-testid='input' />);
      const input = screen.getByTestId('input');
      fireEvent.change(input, { target: { value: 'test value' } });
      expect(input).toHaveValue('test value');
    });

    it('handles focus', () => {
      render(<Input data-testid='input' />);
      const input = screen.getByTestId('input');
      input.focus();
      expect(input).toHaveFocus();
    });
  });

  describe('Accessibility', () => {
    it('supports aria-label', () => {
      render(<Input aria-label='Email input' data-testid='input' />);
      expect(screen.getByTestId('input')).toHaveAccessibleName('Email input');
    });

    it('supports custom id', () => {
      render(<Input id='custom-id' label='Email' />);
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('id', 'custom-id');
    });

    it('generates unique id when not provided', () => {
      render(<Input label='Email' />);
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('id');
    });
  });
});
