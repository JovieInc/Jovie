import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Field } from './field';
import { Input } from './input';

describe('Field', () => {
  describe('Basic Rendering', () => {
    it('renders child input', () => {
      render(
        <Field>
          <Input placeholder='Enter text' />
        </Field>
      );
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <Field ref={ref}>
          <Input />
        </Field>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('has correct displayName', () => {
      expect(Field.displayName).toBe('Field');
    });
  });

  describe('Label', () => {
    it('renders label when provided', () => {
      render(
        <Field label='Email'>
          <Input />
        </Field>
      );
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('associates label with input', () => {
      render(
        <Field label='Email'>
          <Input />
        </Field>
      );
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('shows required indicator when required', () => {
      render(
        <Field label='Email' required>
          <Input />
        </Field>
      );
      expect(screen.getByText('*')).toBeInTheDocument();
      expect(screen.getByText('(required)')).toBeInTheDocument();
    });

    it('does not show label when not provided', () => {
      render(
        <Field>
          <Input placeholder='No label' />
        </Field>
      );
      expect(screen.queryByRole('label')).not.toBeInTheDocument();
    });
  });

  describe('Description', () => {
    it('renders description when provided', () => {
      render(
        <Field description='Enter your email address'>
          <Input />
        </Field>
      );
      expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    });

    it('associates description with input via aria-describedby', () => {
      render(
        <Field description='Help text' id='email'>
          <Input />
        </Field>
      );
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby');
      expect(input.getAttribute('aria-describedby')).toContain('description');
    });
  });

  describe('Error Handling', () => {
    it('renders error message when provided', () => {
      render(
        <Field error='Invalid email address'>
          <Input />
        </Field>
      );
      const error = screen.getByText('Invalid email address');
      expect(error).toBeInTheDocument();
      expect(error).toHaveAttribute('role', 'alert');
    });

    it('sets aria-invalid on input when error is present', () => {
      // Use a simple input element to test Field's aria-invalid injection
      // (Input component has internal validation logic that may override)
      render(
        <Field error='Error message'>
          <input type='text' />
        </Field>
      );
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('associates error with input via aria-describedby', () => {
      render(
        <Field error='Error message' id='email'>
          <Input />
        </Field>
      );
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby');
      expect(input.getAttribute('aria-describedby')).toContain('error');
    });

    it('applies error variant to child when no variant specified', () => {
      render(
        <Field error='Error message'>
          <Input data-testid='input' />
        </Field>
      );
      const input = screen.getByTestId('input');
      // The Field component should inject variant="error"
      expect(input.className).toContain('border-destructive');
    });
  });

  describe('Custom ID', () => {
    it('uses provided id', () => {
      render(
        <Field id='custom-email' label='Email'>
          <Input />
        </Field>
      );
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('id', 'custom-email');
    });

    it('generates unique id when not provided', () => {
      render(
        <Field label='Email'>
          <Input />
        </Field>
      );
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('id');
    });
  });

  describe('Accessibility', () => {
    it('sets aria-required when required', () => {
      render(
        <Field label='Email' required>
          <Input />
        </Field>
      );
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-required', 'true');
    });

    it('error message has aria-live for dynamic updates', () => {
      render(
        <Field error='Error message'>
          <Input />
        </Field>
      );
      const error = screen.getByText('Error message');
      expect(error).toHaveAttribute('aria-live', 'polite');
    });

    it('combines description and error in aria-describedby', () => {
      render(
        <Field description='Help text' error='Error message' id='email'>
          <Input />
        </Field>
      );
      const input = screen.getByRole('textbox');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toContain('email-description');
      expect(describedBy).toContain('email-error');
    });
  });

  describe('Styling', () => {
    it('applies spacing between elements', () => {
      const { container } = render(
        <Field label='Email'>
          <Input />
        </Field>
      );
      const fieldDiv = container.firstChild;
      expect((fieldDiv as HTMLElement).className).toContain('space-y-2');
    });

    it('merges custom className', () => {
      const { container } = render(
        <Field className='custom-class' label='Email'>
          <Input />
        </Field>
      );
      const fieldDiv = container.firstChild;
      expect((fieldDiv as HTMLElement).className).toContain('custom-class');
      expect((fieldDiv as HTMLElement).className).toContain('space-y-2');
    });
  });

  describe('Different Input Types', () => {
    it('works with textarea', () => {
      const Textarea = React.forwardRef<
        HTMLTextAreaElement,
        React.TextareaHTMLAttributes<HTMLTextAreaElement>
      >(({ ...props }, ref) => <textarea ref={ref} {...props} />);
      Textarea.displayName = 'Textarea';

      render(
        <Field label='Description'>
          <Textarea />
        </Field>
      );
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
    });

    it('works with custom input components', () => {
      const CustomInput = React.forwardRef<
        HTMLInputElement,
        React.InputHTMLAttributes<HTMLInputElement>
      >(({ ...props }, ref) => <input ref={ref} {...props} />);
      CustomInput.displayName = 'CustomInput';

      render(
        <Field label='Custom Field'>
          <CustomInput />
        </Field>
      );
      expect(screen.getByLabelText('Custom Field')).toBeInTheDocument();
    });
  });

  describe('React Node Content', () => {
    it('supports React node as label', () => {
      render(
        <Field
          label={
            <span>
              Email <em>(optional)</em>
            </span>
          }
        >
          <Input />
        </Field>
      );
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('(optional)')).toBeInTheDocument();
    });

    it('supports React node as description', () => {
      render(
        <Field
          description={
            <span>
              Read our <a href='https://example.com/privacy'>privacy policy</a>
            </span>
          }
        >
          <Input />
        </Field>
      );
      expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('supports React node as error', () => {
      render(
        <Field
          error={
            <span>
              Invalid email. <a href='https://example.com/help'>Need help?</a>
            </span>
          }
        >
          <Input />
        </Field>
      );
      expect(screen.getByRole('link')).toBeInTheDocument();
    });
  });
});
