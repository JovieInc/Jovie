import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from './form';

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

function FieldContextForm({
  onSubmit = vi.fn(),
  children,
}: {
  onSubmit?: (data: Record<string, string>) => void;
  children?: ReactNode;
}) {
  const form = useForm({ defaultValues: { username: '' } });

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

function RenamableFieldForm({ name }: { name: 'givenName' | 'familyName' }) {
  const form = useForm({
    defaultValues: { givenName: '', familyName: 'Existing surname' },
  });
  const label = name === 'givenName' ? 'Given name' : 'Family name';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(vi.fn())}>
        <FormField
          control={form.control}
          name={name}
          rules={{ required: `${label} is required` }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <input {...field} />
              </FormControl>
              <FormDescription>{label} help.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type='submit'>Submit</button>
      </form>
    </Form>
  );
}

describe('Form certificate evidence', () => {
  describe('FormField', () => {
    it('reads the current field error when its name changes without remounting', async () => {
      const user = userEvent.setup({ delay: null });
      const { rerender } = render(<RenamableFieldForm name='givenName' />);

      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Given name is required'
      );

      rerender(<RenamableFieldForm name='familyName' />);
      const familyName = screen.getByRole('textbox', { name: 'Family name' });
      expect(familyName).toHaveValue('Existing surname');
      expect(familyName).not.toHaveAttribute('aria-invalid');
      expect(screen.getByText('Family name')).not.toHaveAttribute(
        'data-invalid'
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      // The original field's error still exists, but belongs to that field.
      rerender(<RenamableFieldForm name='givenName' />);
      expect(
        screen.getByRole('textbox', { name: 'Given name' })
      ).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Given name is required'
      );
    });

    it('fails clearly outside a FormField context', () => {
      function OrphanFieldProbe() {
        useFormField();
        return null;
      }

      expect(() => render(<OrphanFieldProbe />)).toThrow(
        'useFormField should be used within <FormField>'
      );
    });

    it('fails clearly outside a FormItem context', () => {
      function ItemProbe() {
        useFormField();
        return null;
      }

      expect(() =>
        render(
          <FieldContextForm>
            <FormField name='username' render={() => <ItemProbe />} />
          </FieldContextForm>
        )
      ).toThrow('useFormField should be used within <FormItem>');
    });

    it('provides field context for child components', () => {
      render(<FieldContextForm />);
      // The form renders correctly with field context
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });

    it('connects field to react-hook-form', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(<FieldContextForm onSubmit={onSubmit} />);

      const input = screen.getByPlaceholderText('Enter username');
      await user.type(input, 'testuser');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onSubmit).toHaveBeenCalledWith(
        { username: 'testuser' },
        expect.anything()
      );
    });
  });

  it('has no axe violations before and after a validation error', async () => {
    const user = userEvent.setup();
    const { container } = render(<TestFormWithValidation />);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email is required'
    );
    expect(screen.getByPlaceholderText('Enter email')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
