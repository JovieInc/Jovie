import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Field } from './field';
import { Input } from './input';

const meta: Meta<typeof Field> = {
  title: 'shadcn/Field',
  component: Field,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Field group that wraps a form control with label, description, and error message. Manages aria-describedby/aria-invalid wiring and injects `variant="error"` into the child control when invalid.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: { type: 'text' },
      description: 'Label text for the field',
    },
    description: {
      control: { type: 'text' },
      description: 'Help text shown below the control',
    },
    error: {
      control: { type: 'text' },
      description: 'Error message shown below the control',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Whether the field is required',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core States
export const Default: Story = {
  args: {
    label: 'Artist name',
  },
  render: args => (
    <div className='w-80'>
      <Field {...args}>
        <Input placeholder='e.g. Tina Arena' />
      </Field>
    </div>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <div className='w-80'>
      <Field
        label='Username'
        description='This is your public handle on Jovie.'
      >
        <Input placeholder='@username' />
      </Field>
    </div>
  ),
};

export const WithError: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Email' error='Please enter a valid email address.'>
        <Input type='email' defaultValue='not-an-email' />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'When `error` is set, the child control receives `variant="error"` and `aria-invalid` automatically.',
      },
    },
  },
};

export const Required: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Display name' required>
        <Input placeholder='Your name' />
      </Field>
    </div>
  ),
};

export const Filled: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Artist name' description='Shown on your public profile.'>
        <Input defaultValue='Tina Arena' />
      </Field>
    </div>
  ),
};

export const LongContent: Story = {
  render: () => (
    <div className='w-80'>
      <Field
        label='A very long field label that explains the purpose of this input in exhaustive detail'
        description='This description is intentionally verbose to demonstrate how longer help text wraps within the field layout without breaking the connection to the control below.'
      >
        <Input defaultValue='A value long enough to approach the edge of the container' />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Long labels and descriptions wrap without shifting layout.',
      },
    },
  },
};

// Composition Example
export const CompleteForm: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-6'>
      <Field label='Artist name' required>
        <Input placeholder='e.g. Tina Arena' />
      </Field>
      <Field
        label='Username'
        description='Letters, numbers, and underscores only.'
        error='This username is already taken.'
      >
        <Input defaultValue='tina' />
      </Field>
      <Field label='Bio'>
        <Input placeholder='Tell fans about yourself' />
      </Field>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};
