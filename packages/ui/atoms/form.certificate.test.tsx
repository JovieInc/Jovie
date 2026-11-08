import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Form certificate evidence', () => {
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
