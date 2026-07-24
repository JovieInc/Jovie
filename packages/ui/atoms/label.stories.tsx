import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Label> = {
  title: 'shadcn/Label',
  component: Label,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Radix-based Label with default/muted/error variants and a required indicator. Associates with controls via `htmlFor`.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'muted', 'error'],
      description: 'Visual style variant',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Show required indicator',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core Variants
export const Default: Story = {
  args: {
    children: 'Artist name',
  },
};

export const Muted: Story = {
  args: {
    variant: 'muted',
    children: 'Optional field',
  },
};

export const ErrorVariant: Story = {
  args: {
    variant: 'error',
    children: 'Email',
  },
  parameters: {
    docs: {
      description: {
        story: 'Error tone for labels attached to invalid fields.',
      },
    },
  },
};

export const Required: Story = {
  args: {
    required: true,
    children: 'Display name',
  },
};

// Composition Examples
export const WithInput: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-2'>
      <Label htmlFor='label-input'>Username</Label>
      <Input id='label-input' placeholder='@username' />
    </div>
  ),
};

export const WithDisabledControl: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-2'>
      <Label htmlFor='label-disabled-input'>Locked field</Label>
      <Input id='label-disabled-input' disabled defaultValue='Cannot edit' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The label dims when its associated peer control is disabled (peer-disabled styles).',
      },
    },
  },
};

export const LongContent: Story = {
  args: {
    children:
      'A very long label that explains the purpose of the associated form field in exhaustive detail',
  },
  render: args => (
    <div className='w-80'>
      <Label {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Long labels wrap within their container.',
      },
    },
  },
};

// All Variants Grid
export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-4 p-8'>
      <Label>Default</Label>
      <Label variant='muted'>Muted</Label>
      <Label variant='error'>Error</Label>
      <Label required>Required</Label>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
