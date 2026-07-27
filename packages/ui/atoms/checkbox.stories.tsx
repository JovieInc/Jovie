import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Checkbox } from './checkbox';
import { Label } from './label';

const meta: Meta<typeof Checkbox> = {
  title: 'shadcn/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Radix-based Checkbox with checked, indeterminate, and disabled states. Prefer `checked="indeterminate"` over the deprecated `indeterminate` prop.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: { type: 'select' },
      options: [false, true, 'indeterminate'],
      description: 'Controlled checked state',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Mark the checkbox as required',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core States
export const Default: Story = {
  args: {
    'aria-label': 'Accept terms',
  },
};

export const Checked: Story = {
  args: {
    checked: true,
    'aria-label': 'Accept terms',
  },
};

export const Indeterminate: Story = {
  args: {
    checked: 'indeterminate',
    'aria-label': 'Select all',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Partial selection state, e.g. a "select all" parent with some children selected.',
      },
    },
  },
};

// Disabled States
export const Disabled: Story = {
  args: {
    disabled: true,
    'aria-label': 'Accept terms',
  },
};

export const DisabledChecked: Story = {
  args: {
    checked: true,
    disabled: true,
    'aria-label': 'Accept terms',
  },
};

// Composition Examples
export const WithLabel: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Checkbox id='terms' defaultChecked />
      <Label htmlFor='terms'>Accept terms and conditions</Label>
    </div>
  ),
};

export const WithLongLabel: Story = {
  render: () => (
    <div className='flex max-w-sm items-start gap-2'>
      <Checkbox id='long-terms' className='mt-0.5' />
      <Label htmlFor='long-terms' className='leading-snug'>
        I agree to the terms of service, privacy policy, and consent to
        receiving occasional product updates and marketing communications from
        Jovie.
      </Label>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Long label content wraps without shifting the checkbox.',
      },
    },
  },
};

// All States Grid
export const AllStates: Story = {
  render: () => (
    <div className='flex flex-col gap-4 p-8'>
      <div className='flex items-center gap-2'>
        <Checkbox id='all-unchecked' />
        <Label htmlFor='all-unchecked'>Unchecked</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox id='all-checked' checked />
        <Label htmlFor='all-checked'>Checked</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox id='all-indeterminate' checked='indeterminate' />
        <Label htmlFor='all-indeterminate'>Indeterminate</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox id='all-disabled' disabled />
        <Label htmlFor='all-disabled'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox id='all-disabled-checked' checked disabled />
        <Label htmlFor='all-disabled-checked'>Disabled checked</Label>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
