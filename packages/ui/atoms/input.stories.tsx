import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check } from 'lucide-react';
import { Input } from './input';

const meta: Meta<typeof Input> = {
  title: 'shadcn/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Input with error/success variants, three sizes, loading spinner, status icon, trailing content, and built-in label/help/error messaging.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'error', 'success'],
      description: 'Visual validation variant',
    },
    inputSize: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Input size',
    },
    validationState: {
      control: { type: 'select' },
      options: [null, 'valid', 'invalid', 'pending'],
      description: 'Validation state (overrides variant when set)',
    },
    loading: {
      control: { type: 'boolean' },
      description: 'Show loading spinner and disable the input',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
    label: {
      control: { type: 'text' },
      description: 'Label text rendered above the input',
    },
    error: {
      control: { type: 'text' },
      description: 'Error message rendered below the input',
    },
    helpText: {
      control: { type: 'text' },
      description: 'Help text rendered below the input',
    },
    placeholder: {
      control: { type: 'text' },
      description: 'Placeholder text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core Variants
export const Default: Story = {
  args: {
    placeholder: 'Enter text',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const Filled: Story = {
  args: {
    defaultValue: 'Tina Arena',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const ErrorVariant: Story = {
  args: {
    variant: 'error',
    defaultValue: 'not-an-email',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const SuccessVariant: Story = {
  args: {
    variant: 'success',
    defaultValue: 'tina-arena',
    statusIcon: <Check className='h-4 w-4' />,
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

// Sizes
export const Small: Story = {
  args: {
    inputSize: 'sm',
    placeholder: 'Small input',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const Large: Story = {
  args: {
    inputSize: 'lg',
    placeholder: 'Large input',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

// States
export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'Cannot edit this',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const Loading: Story = {
  args: {
    loading: true,
    defaultValue: 'tina',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Loading shows a spinner, sets aria-busy, and disables the input.',
      },
    },
  },
};

export const ValidationPending: Story = {
  args: {
    validationState: 'pending',
    defaultValue: 'tina',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

// Messaging
export const WithLabel: Story = {
  args: {
    label: 'Artist name',
    placeholder: 'e.g. Tina Arena',
    required: true,
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const WithError: Story = {
  args: {
    label: 'Email',
    error: 'Please enter a valid email address.',
    defaultValue: 'not-an-email',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const WithHelpText: Story = {
  args: {
    label: 'Username',
    helpText: 'Letters, numbers, and underscores only.',
    placeholder: '@username',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

// Composition Examples
export const WithTrailingContent: Story = {
  args: {
    placeholder: 'Enter amount',
    trailing: <span className='text-xs text-tertiary-token'>USD</span>,
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    label:
      'A very long label that describes this input field in exhaustive detail',
    helpText:
      'This help text is intentionally verbose to demonstrate how longer helper copy wraps within the input layout.',
    defaultValue:
      'A value that is long enough to approach the right edge of the input container',
  },
  render: args => (
    <div className='w-80'>
      <Input {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Long labels, help text, and values wrap without overflow.',
      },
    },
  },
};

// All Variants Grid
export const AllVariants: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-4 p-8'>
      <Input placeholder='Default' />
      <Input variant='error' defaultValue='Error variant' />
      <Input variant='success' defaultValue='Success variant' />
      <Input inputSize='sm' placeholder='Small' />
      <Input inputSize='lg' placeholder='Large' />
      <Input disabled defaultValue='Disabled' />
      <Input loading defaultValue='Loading' />
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
