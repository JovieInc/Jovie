import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Textarea } from './textarea';

describe('Textarea', () => {
  describe('Basic Rendering', () => {
    it('renders with default props', () => {
      render(<Textarea placeholder='Enter text' />);
      const textarea = screen.getByPlaceholderText('Enter text');
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('has correct displayName', () => {
      expect(Textarea.displayName).toBe('Textarea');
    });
  });

  describe('Variants and Sizes', () => {
    it('applies default variant classes', () => {
      render(<Textarea data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('border-default');
      expect(textarea.className).toContain('bg-surface-1');
    });

    it('applies error variant classes', () => {
      render(<Textarea variant='error' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('border-destructive');
    });

    it('applies success variant classes', () => {
      render(<Textarea variant='success' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('border-green-500');
    });

    it('applies sm size classes', () => {
      render(<Textarea textareaSize='sm' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('text-xs');
      expect(textarea.className).toContain('min-h-[60px]');
    });

    it('applies md size classes by default', () => {
      render(<Textarea data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('text-sm');
      expect(textarea.className).toContain('min-h-[80px]');
    });

    it('applies lg size classes', () => {
      render(<Textarea textareaSize='lg' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('text-base');
      expect(textarea.className).toContain('min-h-[120px]');
    });

    it('merges custom className', () => {
      render(<Textarea className='custom-class' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('custom-class');
      expect(textarea.className).toContain('border-default');
    });
  });

  describe('Resizable', () => {
    it('is resizable by default', () => {
      render(<Textarea data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('resize-y');
    });

    it('can be non-resizable', () => {
      render(<Textarea resizable={false} data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('resize-none');
    });
  });

  describe('States', () => {
    it('respects disabled state', () => {
      render(<Textarea disabled data-testid='textarea' />);
      expect(screen.getByTestId('textarea')).toBeDisabled();
    });
  });

  describe('Label and Help Text', () => {
    it('renders with label', () => {
      render(<Textarea label='Description' />);
      expect(screen.getByText('Description')).toBeInTheDocument();
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAccessibleName('Description');
    });

    it('renders required indicator with label', () => {
      render(<Textarea label='Description' required />);
      expect(screen.getByText('*')).toBeInTheDocument();
      expect(screen.getByText('(required)')).toBeInTheDocument();
    });

    it('renders help text', () => {
      render(<Textarea helpText='Enter a detailed description' />);
      expect(
        screen.getByText('Enter a detailed description')
      ).toBeInTheDocument();
    });

    it('associates help text with textarea via aria-describedby', () => {
      render(<Textarea helpText='Help text' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      const describedBy = textarea.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('renders error message', () => {
      render(<Textarea error='This field is required' />);
      const errorMessage = screen.getByText('This field is required');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveAttribute('role', 'alert');
    });

    it('applies error variant when error prop is provided', () => {
      render(<Textarea error='Error message' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('border-destructive');
    });

    it('sets aria-invalid when error is present', () => {
      render(<Textarea error='Error message' data-testid='textarea' />);
      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    it('hides help text when error is present', () => {
      render(<Textarea helpText='Help text' error='Error message' />);
      expect(screen.queryByText('Help text')).not.toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });
  });

  describe('Validation State', () => {
    it('applies invalid validation state', () => {
      render(<Textarea validationState='invalid' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('border-destructive');
      expect(textarea).toHaveAttribute('aria-invalid', 'true');
    });

    it('applies valid validation state', () => {
      render(<Textarea validationState='valid' data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('border-green-500');
    });
  });

  describe('Interaction', () => {
    it('handles value change', () => {
      render(<Textarea data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      fireEvent.change(textarea, { target: { value: 'test content' } });
      expect(textarea).toHaveValue('test content');
    });

    it('handles focus', () => {
      render(<Textarea data-testid='textarea' />);
      const textarea = screen.getByTestId('textarea');
      textarea.focus();
      expect(textarea).toHaveFocus();
    });
  });

  describe('Accessibility', () => {
    it('supports aria-label', () => {
      render(<Textarea aria-label='Message input' data-testid='textarea' />);
      expect(screen.getByTestId('textarea')).toHaveAccessibleName(
        'Message input'
      );
    });

    it('supports custom id', () => {
      render(<Textarea id='custom-id' label='Description' />);
      const textarea = screen.getByLabelText('Description');
      expect(textarea).toHaveAttribute('id', 'custom-id');
    });

    it('generates unique id when not provided', () => {
      render(<Textarea label='Description' />);
      const textarea = screen.getByLabelText('Description');
      expect(textarea).toHaveAttribute('id');
    });
  });
});
