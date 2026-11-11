import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type FieldErrors, useForm } from 'react-hook-form';
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

const meta: Meta = {
  title: 'UI/Atoms/Form',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

function DemoForm({ withError = false }: { readonly withError?: boolean }) {
  const form = useForm({
    defaultValues: { name: withError ? '' : 'Jovie' },
  });
  return (
    <Form {...form}>
      <form
        className='flex w-72 flex-col gap-3'
        onSubmit={form.handleSubmit(() => undefined)}
      >
        <FormField
          control={form.control}
          name='name'
          rules={{ required: 'Name is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder='Your name' {...field} />
              </FormControl>
              <FormDescription>Public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit'>Save</Button>
      </form>
    </Form>
  );
}

export const Default: Story = {
  render: () => <DemoForm />,
};

export const EmptyError: Story = {
  render: () => <DemoForm withError />,
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button[type="submit"]');
    if (button instanceof HTMLButtonElement) button.click();
  },
};

export const LongValidationMessage: Story = {
  render: () => {
    const form = useForm({ defaultValues: { handle: '' } });
    return (
      <Form {...form}>
        <form className='w-64' onSubmit={event => event.preventDefault()}>
          <FormField
            control={form.control}
            name='handle'
            rules={{
              required:
                'Choose a public handle before continuing so listeners can find your profile.',
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Public handle</FormLabel>
                <FormControl>
                  <Input placeholder='artist' {...field} />
                </FormControl>
                <FormDescription>Letters, numbers, and dashes.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button className='mt-3' type='submit'>
            Continue
          </Button>
        </form>
      </Form>
    );
  },
};

/**
 * react-hook-form 7.90 re-applies useForm's errors option in an effect keyed
 * on the prop's reference ([control, props.errors]). An inline literal is a
 * fresh reference every render, so the effect fired on every render and
 * looped this story to "Maximum update depth exceeded" until the Visual &
 * A11y shard timed out (run 42709958968, shard 11, both attempts). The
 * module-level constant is stable: the server error applies once and the
 * rendered error state stays checkable.
 */
const SERVER_HANDLE_ERRORS = {
  handle: { type: 'server', message: 'That handle is already taken.' },
} satisfies FieldErrors<{ handle: string }>;

function ServerErrorForm() {
  const form = useForm({
    defaultValues: { handle: 'jovie' },
    errors: SERVER_HANDLE_ERRORS,
  });
  return (
    <Form {...form}>
      <form className='w-72' onSubmit={event => event.preventDefault()}>
        <FormField
          control={form.control}
          name='handle'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Public handle</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>Letters, numbers, and dashes.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export const ErrorState: Story = {
  render: () => <ServerErrorForm />,
  parameters: {
    docs: {
      description: {
        story:
          'A server error set through react-hook-form: the label turns destructive, the control gets aria-invalid, and the message is announced.',
      },
    },
  },
};

function LockedFieldForm() {
  const form = useForm({ defaultValues: { payoutEmail: 'owner@jov.ie' } });
  return (
    <Form {...form}>
      <form className='w-72' onSubmit={event => event.preventDefault()}>
        <FormField
          control={form.control}
          name='payoutEmail'
          disabled
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payout email</FormLabel>
              <FormControl>
                <Input type='email' {...field} />
              </FormControl>
              <FormDescription>
                Only the account owner can change where payouts are sent.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export const PermissionDenied: Story = {
  render: () => <LockedFieldForm />,
  parameters: {
    docs: {
      description: {
        story:
          'A field disabled through FormField for a viewer without rights; the description explains who can change it.',
      },
    },
  },
};

function RtlForm() {
  const form = useForm({ defaultValues: { name: '' } });
  return (
    <Form {...form}>
      <form
        dir='rtl'
        className='flex w-64 flex-col gap-3'
        onSubmit={form.handleSubmit(() => undefined)}
      >
        <FormField
          control={form.control}
          name='name'
          rules={{
            required:
              'اختر اسمًا عامًا قبل المتابعة حتى يتمكن المعجبون من العثور على ملفك الشخصي.',
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>اسم العرض كما يظهر في ملفك الشخصي العام</FormLabel>
              <FormControl>
                <Input
                  placeholder='اكتب الاسم الذي يعرفك به المعجبون'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                يظهر هذا الاسم في أعلى صفحة الروابط الخاصة بك.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit'>حفظ</Button>
      </form>
    </Form>
  );
}

export const Rtl: Story = {
  render: () => <RtlForm />,
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button[type="submit"]');
    if (button instanceof HTMLButtonElement) button.click();
  },
  parameters: {
    docs: {
      description: {
        story:
          'Arabic label, description, and a long validation message in a narrow right-to-left form; submitting empty shows the wrapped message.',
      },
    },
  },
};
