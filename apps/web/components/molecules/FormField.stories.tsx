import { Input } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FormField } from './FormField';

const meta: Meta<typeof FormField> = {
  title: 'Molecules/FormField',
  component: FormField,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  args: {
    label: 'Email Address',
    children: <Input type='email' placeholder='you@example.com' />,
    className: 'w-80',
  },
};

export const Required: Story = {
  args: {
    label: 'Username',
    required: true,
    children: <Input placeholder='Enter your username' />,
    className: 'w-80',
  },
};

export const WithHelpText: Story = {
  args: {
    label: 'Handle',
    helpText:
      'Your unique profile URL. Only letters, numbers, and underscores.',
    children: <Input placeholder='@yourhandle' />,
    className: 'w-80',
  },
};

export const WithError: Story = {
  args: {
    label: 'Password',
    required: true,
    error: 'Password must be at least 8 characters.',
    children: <Input type='password' placeholder='Enter password' />,
    className: 'w-80',
  },
};

export const WithHelpTextAndError: Story = {
  args: {
    label: 'Display Name',
    required: true,
    helpText: 'This will be shown on your public profile.',
    error: 'Display name is required.',
    children: <Input placeholder='Your display name' />,
    className: 'w-80',
  },
};

export const FormExample: Story = {
  render: () => (
    <form className='space-y-4 w-80'>
      <FormField label='Display Name' required>
        <Input placeholder='John Doe' />
      </FormField>
      <FormField label='Handle' required helpText='Your unique profile URL'>
        <Input placeholder='@johndoe' />
      </FormField>
      <FormField label='Bio' helpText='Tell fans about yourself (optional)'>
        <Input placeholder='Singer, songwriter, producer...' />
      </FormField>
    </form>
  ),
};
