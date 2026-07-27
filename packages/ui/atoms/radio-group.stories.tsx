import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';

const meta: Meta<typeof RadioGroup> = {
  title: 'shadcn/RadioGroup',
  component: RadioGroup,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'RadioGroup built on Radix UI with proper ARIA roles and keyboard navigation. Compose RadioGroup with RadioGroupItem and Label for accessible option lists.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: { type: 'text' },
      description: 'The initially selected option value',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disable every option in the group',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function PlanOptions({ disabled }: { disabled?: boolean }) {
  return (
    <>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='free' id='plan-free' disabled={disabled} />
        <Label htmlFor='plan-free'>Free</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='pro' id='plan-pro' disabled={disabled} />
        <Label htmlFor='plan-pro'>Pro</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem
          value='enterprise'
          id='plan-enterprise'
          disabled={disabled}
        />
        <Label htmlFor='plan-enterprise'>Enterprise</Label>
      </div>
    </>
  );
}

// Core States
export const Default: Story = {
  render: args => (
    <RadioGroup {...args}>
      <PlanOptions />
    </RadioGroup>
  ),
};

export const WithDefaultValue: Story = {
  render: args => (
    <RadioGroup {...args} defaultValue='pro'>
      <PlanOptions />
    </RadioGroup>
  ),
};

// States
export const DisabledOption: Story = {
  render: args => (
    <RadioGroup {...args} defaultValue='free'>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='free' id='opt-free' />
        <Label htmlFor='opt-free'>Free</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='pro' id='opt-pro' disabled />
        <Label htmlFor='opt-pro'>Pro (unavailable)</Label>
      </div>
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story: 'A single disabled option inside an enabled group.',
      },
    },
  },
};

export const DisabledGroup: Story = {
  render: args => (
    <RadioGroup {...args} defaultValue='pro'>
      <PlanOptions disabled />
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Every option disabled: cursor-not-allowed and 50% opacity.',
      },
    },
  },
};

// Content Stress
export const LongLabels: Story = {
  render: args => (
    <RadioGroup {...args} defaultValue='annual'>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='monthly' id='billing-monthly' />
        <Label htmlFor='billing-monthly'>
          Monthly billing with the ability to cancel your subscription at any
          time
        </Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='annual' id='billing-annual' />
        <Label htmlFor='billing-annual'>
          Annual billing with two months free and priority support included
        </Label>
      </div>
    </RadioGroup>
  ),
};

export const NarrowContainer: Story = {
  render: args => (
    <div className='w-44'>
      <RadioGroup {...args} defaultValue='pro'>
        <PlanOptions />
      </RadioGroup>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Group inside a 176px container to verify label wrapping.',
      },
    },
  },
};

// Dark Mode Preview
export const DarkMode: Story = {
  render: args => (
    <RadioGroup {...args} defaultValue='pro'>
      <PlanOptions />
    </RadioGroup>
  ),
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
