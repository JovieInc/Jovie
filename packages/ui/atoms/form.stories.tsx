import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
