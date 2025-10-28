import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Checkbox } from './checkbox';
import { Field } from './field';
import { Input } from './input';
import { Switch } from './switch';

const meta: Meta<typeof Field> = {
  title: 'shadcn/Field',
  component: Field,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Field wrapper component that provides label, description, and error messaging for form controls. Automatically handles accessibility attributes and visual feedback.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: { type: 'text' },
      description: 'Field label text',
    },
    description: {
      control: { type: 'text' },
      description: 'Helper text displayed below the input',
    },
    error: {
      control: { type: 'text' },
      description: 'Error message (shows in red, sets aria-invalid)',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Show required indicator (*) on label',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Examples
export const Default: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Email address'>
        <Input type='email' placeholder='you@example.com' />
      </Field>
    </div>
  ),
};

export const Required: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Username' required>
        <Input placeholder='Enter username' />
      </Field>
    </div>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <div className='w-80'>
      <Field
        label='Display name'
        description='This is how your name will appear to others'
      >
        <Input placeholder='John Doe' />
      </Field>
    </div>
  ),
};

export const WithError: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Email' error='Please enter a valid email address' required>
        <Input
          type='email'
          placeholder='you@example.com'
          variant='error'
          defaultValue='invalid-email'
        />
      </Field>
    </div>
  ),
};

export const WithDescriptionAndError: Story = {
  render: () => (
    <div className='w-80'>
      <Field
        label='Password'
        description='Must be at least 8 characters'
        error='Password is too short'
        required
      >
        <Input
          type='password'
          placeholder='••••••••'
          variant='error'
          defaultValue='abc'
        />
      </Field>
    </div>
  ),
};

// Different Input Types
export const WithCheckbox: Story = {
  render: () => (
    <div className='w-80'>
      <Field
        label='Terms and conditions'
        description='You must agree to continue'
        required
      >
        <Checkbox />
      </Field>
    </div>
  ),
};

export const WithSwitch: Story = {
  render: () => (
    <div className='w-80'>
      <Field
        label='Enable notifications'
        description='Receive email updates about your account'
      >
        <Switch />
      </Field>
    </div>
  ),
};

// Complex Examples
export const ValidationStates: Story = {
  render: () => (
    <div className='w-full max-w-md space-y-6'>
      <div>
        <h3 className='text-sm font-semibold mb-3'>Neutral (Default)</h3>
        <Field label='Username' description='Choose a unique username'>
          <Input placeholder='johndoe' />
        </Field>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>Success</h3>
        <Field label='Handle' description='Your unique identifier'>
          <Input
            variant='success'
            defaultValue='available-handle'
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

      <div>
        <h3 className='text-sm font-semibold mb-3'>Error</h3>
        <Field
          label='Email'
          description="We'll send a verification link"
          error='This email is already registered'
          required
        >
          <Input
            type='email'
            variant='error'
            defaultValue='taken@example.com'
          />
        </Field>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

export const FormExample: Story = {
  render: () => (
    <div className='w-full max-w-md space-y-4 p-6 border rounded-lg'>
      <h2 className='text-lg font-semibold mb-4'>Create Account</h2>

      <Field label='Full Name' required>
        <Input placeholder='John Doe' />
      </Field>

      <Field
        label='Email'
        description="We'll send a verification link"
        required
      >
        <Input type='email' placeholder='john@example.com' />
      </Field>

      <Field label='Username' description='Choose a unique username' required>
        <Input placeholder='johndoe' />
      </Field>

      <Field
        label='Password'
        description='Must be at least 8 characters'
        required
      >
        <Input type='password' placeholder='••••••••' />
      </Field>

      <Field label='Bio' description='Tell us about yourself (optional)'>
        <Input placeholder='Software engineer, coffee enthusiast' />
      </Field>

      <Field
        label='Agree to terms'
        description='You must agree to our terms and conditions'
        required
      >
        <Checkbox />
      </Field>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

export const WithLoadingState: Story = {
  render: () => (
    <div className='w-80'>
      <Field label='Handle' description='Checking availability...'>
        <Input placeholder='your-handle' defaultValue='checking' loading />
      </Field>
    </div>
  ),
};

export const CompactForm: Story = {
  render: () => (
    <div className='w-full max-w-sm space-y-3'>
      <Field label='Email' required>
        <Input type='email' inputSize='sm' placeholder='you@example.com' />
      </Field>

      <Field label='Password' required>
        <Input type='password' inputSize='sm' placeholder='••••••••' />
      </Field>

      <Field label='Remember me'>
        <Checkbox />
      </Field>
    </div>
  ),
};

export const LargeForm: Story = {
  render: () => (
    <div className='w-full max-w-lg space-y-4'>
      <Field label='Display Name' required>
        <Input inputSize='lg' placeholder='Your name' />
      </Field>

      <Field label='Bio' description='Tell your audience about yourself'>
        <Input
          inputSize='lg'
          placeholder='Software engineer, creator, coffee enthusiast'
        />
      </Field>
    </div>
  ),
};

export const DarkMode: Story = {
  render: () => (
    <div className='w-80 space-y-4'>
      <Field label='Email' description="We'll never share your email" required>
        <Input type='email' placeholder='you@example.com' />
      </Field>

      <Field
        label='Password'
        error='Password must be at least 8 characters'
        required
      >
        <Input
          type='password'
          placeholder='••••••••'
          variant='error'
          defaultValue='abc'
        />
      </Field>
    </div>
  ),
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='flex flex-col gap-6 p-8 w-full max-w-2xl'>
      <div>
        <h3 className='text-sm font-semibold mb-3'>Label Variations</h3>
        <div className='space-y-3'>
          <Field label='Simple label'>
            <Input placeholder='Basic field' />
          </Field>
          <Field label='Required field' required>
            <Input placeholder='Required input' />
          </Field>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>With Descriptions</h3>
        <div className='space-y-3'>
          <Field
            label='Username'
            description='This will be your public username'
          >
            <Input placeholder='johndoe' />
          </Field>
          <Field
            label='Email'
            description="We'll send a verification link to this address"
            required
          >
            <Input type='email' placeholder='you@example.com' />
          </Field>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>Error States</h3>
        <div className='space-y-3'>
          <Field label='Email' error='Email is required' required>
            <Input type='email' variant='error' placeholder='you@example.com' />
          </Field>
          <Field
            label='Password'
            description='Must be at least 8 characters'
            error='Password is too short'
            required
          >
            <Input
              type='password'
              variant='error'
              placeholder='••••••••'
              defaultValue='abc'
            />
          </Field>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>Success States</h3>
        <Field label='Handle' description='This handle is available!'>
          <Input
            variant='success'
            defaultValue='available-handle'
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
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
