import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from './button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form';
import { Input } from './input';

const meta: Meta<typeof Form> = {
  title: 'shadcn/Form',
  component: Form,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'react-hook-form composition primitives (Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage) that wire labels, descriptions, and validation messages to controls via aria attributes.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

interface ProfileFormValues {
  username: string;
  email: string;
}

function ProfileForm({ withError = false }: { readonly withError?: boolean }) {
  const form = useForm<ProfileFormValues>({
    defaultValues: { username: '', email: '' },
  });

  // Deterministic error state for Storybook (no user interaction required)
  React.useEffect(() => {
    if (withError) {
      form.setError('email', {
        type: 'required',
        message: 'Email is required',
      });
    }
  }, [form, withError]);

  return (
    <Form {...form}>
      <form
        className='flex w-80 flex-col gap-4'
        onSubmit={form.handleSubmit(() => {})}
      >
        <FormField
          control={form.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder='@username' {...field} />
              </FormControl>
              <FormDescription>
                This is your public handle on Jovie.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='email'
          rules={{ required: 'Email is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type='email' placeholder='you@example.com' {...field} />
              </FormControl>
              <FormDescription>We will never share your email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit' className='self-start'>
          Save profile
        </Button>
      </form>
    </Form>
  );
}

// Core States
export const Default: Story = {
  render: () => <ProfileForm />,
  parameters: {
    docs: {
      description: {
        story:
          'Composed form with label, description, and wired-up validation. Submit the empty form to see live validation.',
      },
    },
  },
};

export const WithValidationError: Story = {
  render: () => <ProfileForm withError />,
  parameters: {
    docs: {
      description: {
        story:
          'Field in an error state: FormLabel turns destructive, FormControl sets aria-invalid, and FormMessage renders the error.',
      },
    },
  },
};
