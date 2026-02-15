import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form';

// Helper: wraps form fields in a full Form context using react-hook-form
function TestForm({
  defaultValues = { username: '' },
  onSubmit = vi.fn(),
  children,
}: {
  defaultValues?: Record<string, string>;
  onSubmit?: (data: Record<string, string>) => void;
  children?: React.ReactNode;
}) {
  const form = useForm({ defaultValues });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {children || (
          <FormField
            control={form.control}
            name='username'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <input placeholder='Enter username' {...field} />
                </FormControl>
                <FormDescription>Your public display name.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <button type='submit'>Submit</button>
      </form>
    </Form>
  );
}

// Helper: Form with validation for testing error states
function TestFormWithValidation({
  onSubmit = vi.fn(),
}: {
  onSubmit?: (data: Record<string, string>) => void;
}) {
  const form = useForm({
    defaultValues: { email: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name='email'
          rules={{ required: 'Email is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <input type='email' placeholder='Enter email' {...field} />
              </FormControl>
              <FormDescription>We will never share your email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type='submit'>Submit</button>
      </form>
    </Form>
  );
}

describe('Form', () => {
  describe('FormItem', () => {
    it('renders as a div with children', () => {
      render(<TestForm />);
      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });

    it('applies space-y-2 base class', () => {
      render(
        <TestForm>
          <FormField
            name='username'
            render={({ field }) => (
              <FormItem data-testid='form-item'>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <input {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </TestForm>
      );
      const formItem = screen.getByTestId('form-item');
      expect(formItem.className).toContain('space-y-2');
    });

    it('merges custom className', () => {
      render(
        <TestForm>
          <FormField
            name='username'
            render={({ field }) => (
              <FormItem className='custom-class' data-testid='form-item'>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <input {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </TestForm>
      );
      const formItem = screen.getByTestId('form-item');
      expect(formItem.className).toContain('custom-class');
    });

    it('forwards ref', () => {
      const ref = React.createRef<HTMLDivElement>();
      function FormWithRef() {
        const form = useForm({ defaultValues: { name: '' } });
        return (
          <Form {...form}>
            <FormField
              name='name'
              render={({ field }) => (
                <FormItem ref={ref}>
                  <FormControl>
                    <input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </Form>
        );
      }
      render(<FormWithRef />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('FormLabel', () => {
    it('renders label text', () => {
      render(<TestForm />);
      expect(screen.getByText('Username')).toBeInTheDocument();
    });

    it('associates label with form control via htmlFor', () => {
      render(<TestForm />);
      const label = screen.getByText('Username');
      const input = screen.getByPlaceholderText('Enter username');
      // FormLabel sets htmlFor to formItemId, and FormControl sets id to formItemId
      expect(label).toHaveAttribute('for', input.id);
    });

    it('applies error styling when field has error', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestFormWithValidation />);

      // Submit without filling in the required field to trigger validation
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      // After validation, the label should have the destructive class
      const label = await screen.findByText('Email');
      expect(label.className).toContain('text-destructive');
    });
  });

  describe('FormControl', () => {
    it('renders the child input', () => {
      render(<TestForm />);
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });

    it('sets aria-describedby to description id', () => {
      render(<TestForm />);
      const input = screen.getByPlaceholderText('Enter username');
      // Should reference the description element
      expect(input).toHaveAttribute('aria-describedby');
      expect(input.getAttribute('aria-describedby')).toBeTruthy();
    });

    it('sets aria-invalid to false when no error', () => {
      render(<TestForm />);
      const input = screen.getByPlaceholderText('Enter username');
      expect(input).toHaveAttribute('aria-invalid', 'false');
    });

    it('sets aria-invalid to true when field has error', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestFormWithValidation />);

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      const input = await screen.findByPlaceholderText('Enter email');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('includes message id in aria-describedby when error exists', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestFormWithValidation />);

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      const input = await screen.findByPlaceholderText('Enter email');
      const describedBy = input.getAttribute('aria-describedby') || '';
      // Should include both description and message ids
      expect(describedBy.split(' ').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('FormDescription', () => {
    it('renders description text', () => {
      render(<TestForm />);
      expect(screen.getByText('Your public display name.')).toBeInTheDocument();
    });

    it('applies muted foreground styling', () => {
      render(<TestForm />);
      const description = screen.getByText('Your public display name.');
      expect(description.className).toContain('text-sm');
      expect(description.className).toContain('text-muted-foreground');
    });

    it('merges custom className', () => {
      render(
        <TestForm>
          <FormField
            name='username'
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <input {...field} />
                </FormControl>
                <FormDescription className='custom-desc'>
                  Help text
                </FormDescription>
              </FormItem>
            )}
          />
        </TestForm>
      );
      const description = screen.getByText('Help text');
      expect(description.className).toContain('custom-desc');
    });

    it('forwards ref', () => {
      const ref = React.createRef<HTMLParagraphElement>();
      function FormWithDescRef() {
        const form = useForm({ defaultValues: { name: '' } });
        return (
          <Form {...form}>
            <FormField
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <input {...field} />
                  </FormControl>
                  <FormDescription ref={ref}>Description</FormDescription>
                </FormItem>
              )}
            />
          </Form>
        );
      }
      render(<FormWithDescRef />);
      expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
    });
  });

  describe('FormMessage', () => {
    it('does not render when no error and no children', () => {
      render(<TestForm />);
      // FormMessage should not appear when there are no errors
      expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
    });

    it('renders error message on validation failure', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestFormWithValidation />);

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(await screen.findByText('Email is required')).toBeInTheDocument();
    });

    it('applies destructive styling to error message', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestFormWithValidation />);

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      const message = await screen.findByText('Email is required');
      expect(message.className).toContain('text-destructive');
      expect(message.className).toContain('text-sm');
      expect(message.className).toContain('font-medium');
    });

    it('renders children as body when no error', () => {
      render(
        <TestForm>
          <FormField
            name='username'
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <input {...field} />
                </FormControl>
                <FormMessage>Custom message</FormMessage>
              </FormItem>
            )}
          />
        </TestForm>
      );
      expect(screen.getByText('Custom message')).toBeInTheDocument();
    });

    it('merges custom className', () => {
      render(
        <TestForm>
          <FormField
            name='username'
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <input {...field} />
                </FormControl>
                <FormMessage className='custom-msg'>Message</FormMessage>
              </FormItem>
            )}
          />
        </TestForm>
      );
      const message = screen.getByText('Message');
      expect(message.className).toContain('custom-msg');
    });

    it('forwards ref', () => {
      const ref = React.createRef<HTMLParagraphElement>();
      function FormWithMsgRef() {
        const form = useForm({ defaultValues: { name: '' } });
        return (
          <Form {...form}>
            <FormField
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <input {...field} />
                  </FormControl>
                  <FormMessage ref={ref}>Message</FormMessage>
                </FormItem>
              )}
            />
          </Form>
        );
      }
      render(<FormWithMsgRef />);
      expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
    });
  });

  describe('FormField', () => {
    it('provides field context for child components', () => {
      render(<TestForm />);
      // The form renders correctly with field context
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });

    it('connects field to react-hook-form', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(<TestForm onSubmit={onSubmit} />);

      const input = screen.getByPlaceholderText('Enter username');
      await user.type(input, 'testuser');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onSubmit).toHaveBeenCalledWith(
        { username: 'testuser' },
        expect.anything()
      );
    });
  });

  describe('Form Integration', () => {
    it('handles full form submission flow', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup({ delay: null });

      function FullForm() {
        const form = useForm({
          defaultValues: { name: '', email: '' },
        });
        return (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <input placeholder='Name' {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <input placeholder='Email' {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <button type='submit'>Submit</button>
            </form>
          </Form>
        );
      }

      render(<FullForm />);
      await user.type(screen.getByPlaceholderText('Name'), 'John');
      await user.type(screen.getByPlaceholderText('Email'), 'john@test.com');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'John', email: 'john@test.com' },
        expect.anything()
      );
    });

    it('blocks submission when validation fails', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(<TestFormWithValidation onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(await screen.findByText('Email is required')).toBeInTheDocument();
    });
  });
});
