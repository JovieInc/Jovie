import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Field } from './field';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Input> = {
  title: 'shadcn/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Versatile input component with validation states, loading indicators, and status icons. Built on native HTML input with enhanced accessibility and DX.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'error', 'success'],
      description: 'Visual validation state',
    },
    inputSize: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Input size',
    },
    loading: {
      control: { type: 'boolean' },
      description: 'Show loading spinner',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
    type: {
      control: { type: 'select' },
      options: ['text', 'email', 'password', 'number', 'tel', 'url'],
      description: 'HTML input type',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Variants
export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: 'Hello, World!',
    placeholder: 'Enter text...',
  },
};

export const Error: Story = {
  args: {
    placeholder: 'Enter email...',
    variant: 'error',
    defaultValue: 'invalid-email',
  },
};

export const Success: Story = {
  args: {
    placeholder: 'Enter email...',
    variant: 'success',
    defaultValue: 'valid@example.com',
  },
};

// Sizes
export const Small: Story = {
  args: {
    inputSize: 'sm',
    placeholder: 'Small input',
  },
};

export const Medium: Story = {
  args: {
    inputSize: 'md',
    placeholder: 'Medium input (default)',
  },
};

export const Large: Story = {
  args: {
    inputSize: 'lg',
    placeholder: 'Large input',
  },
};

// States
export const Loading: Story = {
  args: {
    placeholder: 'Checking availability...',
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled input',
    disabled: true,
  },
};

export const DisabledWithValue: Story = {
  args: {
    defaultValue: 'Read-only value',
    disabled: true,
  },
};

// Status Icons
export const WithStatusIcon: Story = {
  args: {
    placeholder: 'Enter handle...',
    statusIcon: (
      <svg
        className='h-4 w-4 text-green-600'
        viewBox='0 0 20 20'
        fill='currentColor'
      >
        <path
          fillRule='evenodd'
          d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.2 4.4-1.63-1.63a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.145-.089l3.71-5.109z'
          clipRule='evenodd'
        />
      </svg>
    ),
  },
};

export const WithTrailing: Story = {
  args: {
    placeholder: 'Search...',
    trailing: (
      <button className='text-xs text-blue-600 hover:text-blue-700'>
        Clear
      </button>
    ),
  },
};

// Input Types
export const Email: Story = {
  args: {
    type: 'email',
    placeholder: 'email@example.com',
  },
};

export const Password: Story = {
  args: {
    type: 'password',
    placeholder: 'Enter password',
  },
};

export const Number: Story = {
  args: {
    type: 'number',
    placeholder: '0',
    min: 0,
    max: 100,
  },
};

export const Tel: Story = {
  args: {
    type: 'tel',
    placeholder: '+1 (555) 000-0000',
  },
};

export const URL: Story = {
  args: {
    type: 'url',
    placeholder: 'https://example.com',
  },
};

// Complex Examples
export const WithField: Story = {
  render: () => (
    <div className='w-80'>
      <Field
        label='Email address'
        description="We'll never share your email"
        required
      >
        <Input type='email' placeholder='you@example.com' />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Input wrapped with Field component for labels, descriptions, and errors',
      },
    },
  },
};

export const WithFieldError: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Username' error='Username is already taken' required>
        <Input
          variant='error'
          defaultValue='taken-username'
          placeholder='Enter username'
        />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Field with error message and error variant input',
      },
    },
  },
};

export const WithFieldSuccess: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Handle' description='Your unique identifier'>
        <Input
          variant='success'
          defaultValue='available-handle'
          placeholder='your-handle'
          statusIcon={
            <svg
              className='h-4 w-4 text-green-600'
              viewBox='0 0 20 20'
              fill='currentColor'
            >
              <path
                fillRule='evenodd'
                d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.2 4.4-1.63-1.63a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.145-.089l3.71-5.109z'
                clipRule='evenodd'
              />
            </svg>
          }
        />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Field with success state and status icon',
      },
    },
  },
};

export const FullWidthForm: Story = {
  render: () => (
    <div className='w-full max-w-md space-y-4 p-6'>
      <Field label='Full Name' required>
        <Input placeholder='John Doe' />
      </Field>

      <Field
        label='Email'
        description="We'll send verification to this address"
        required
      >
        <Input type='email' placeholder='john@example.com' />
      </Field>

      <Field label='Password' required>
        <Input type='password' placeholder='••••••••' />
      </Field>

      <Field label='Bio' description='Tell us about yourself'>
        <Input placeholder='Software engineer, coffee enthusiast' />
      </Field>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Complete form example with multiple inputs and fields',
      },
    },
  },
};

export const DarkMode: Story = {
  args: {
    placeholder: 'Input in dark mode',
    defaultValue: 'Dark mode styled',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// All Variants Grid
export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-6 p-8 w-full max-w-2xl'>
      <div>
        <h3 className='text-sm font-semibold mb-3'>Variants</h3>
        <div className='flex flex-col gap-2'>
          <div>
            <Label className='text-xs text-gray-500 mb-1'>Default</Label>
            <Input placeholder='Default variant' />
          </div>
          <div>
            <Label className='text-xs text-gray-500 mb-1'>Error</Label>
            <Input placeholder='Error variant' variant='error' />
          </div>
          <div>
            <Label className='text-xs text-gray-500 mb-1'>Success</Label>
            <Input placeholder='Success variant' variant='success' />
          </div>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>Sizes</h3>
        <div className='flex flex-col gap-2'>
          <Input inputSize='sm' placeholder='Small' />
          <Input inputSize='md' placeholder='Medium (default)' />
          <Input inputSize='lg' placeholder='Large' />
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>States</h3>
        <div className='flex flex-col gap-2'>
          <Input placeholder='Normal' />
          <Input placeholder='Loading...' loading />
          <Input placeholder='Disabled' disabled />
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>With Field</h3>
        <div className='flex flex-col gap-4'>
          <Field label='Simple' required>
            <Input placeholder='Required field' />
          </Field>
          <Field label='With error' error='This field is required'>
            <Input placeholder='Error state' variant='error' />
          </Field>
          <Field label='With description' description='Helper text goes here'>
            <Input placeholder='With helper text' />
          </Field>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
