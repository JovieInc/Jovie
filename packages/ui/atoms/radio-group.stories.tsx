import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';

const meta: Meta<typeof RadioGroup> = {
  title: 'UI/Atoms/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue='a' className='flex flex-col gap-2'>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='a' id='rg-a' />
        <Label htmlFor='rg-a'>Option A</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='b' id='rg-b' />
        <Label htmlFor='rg-b'>Option B</Label>
      </div>
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue='a' disabled className='flex gap-6'>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='a' id='rg-da' />
        <Label htmlFor='rg-da'>Selected</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='b' id='rg-db' />
        <Label htmlFor='rg-db'>Unselected</Label>
      </div>
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue='email' className='flex gap-6'>
      {[
        ['email', 'Email'],
        ['sms', 'SMS'],
        ['none', 'None'],
      ].map(([value, label]) => (
        <div className='flex items-center gap-2' key={value}>
          <RadioGroupItem value={value} id={`rg-${value}`} />
          <Label htmlFor={`rg-${value}`}>{label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const EmptySelection: Story = {
  render: () => (
    <RadioGroup aria-label='Release visibility' className='flex flex-col gap-2'>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='public' id='rg-empty-public' />
        <Label htmlFor='rg-empty-public'>Public</Label>
      </div>
      <div className='flex items-center gap-2'>
        <RadioGroupItem value='private' id='rg-empty-private' />
        <Label htmlFor='rg-empty-private'>Private</Label>
      </div>
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'No value yet: the group renders with no option checked until the user picks one.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <RadioGroup
      aria-label='Notification frequency'
      defaultValue='weekly'
      className='w-56'
    >
      <div className='flex items-start gap-2'>
        <RadioGroupItem
          value='instant'
          id='rg-long-instant'
          className='mt-0.5'
        />
        <Label htmlFor='rg-long-instant' className='leading-snug'>
          Instantly, every time a fan presaves, follows, or shares a release
        </Label>
      </div>
      <div className='flex items-start gap-2'>
        <RadioGroupItem value='weekly' id='rg-long-weekly' className='mt-0.5' />
        <Label htmlFor='rg-long-weekly' className='leading-snug'>
          A weekly digest that summarises fan activity across all of my profiles
        </Label>
      </div>
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Long option labels in a narrow column wrap beside each radio, which keeps its 16px size and aligns to the first line.',
      },
    },
  },
};

export const PermissionDenied: Story = {
  render: () => (
    <div className='grid w-64 gap-2'>
      <RadioGroup
        aria-label='Payout schedule'
        aria-describedby='rg-permission-reason'
        defaultValue='monthly'
        disabled
        className='flex flex-col gap-2'
      >
        <div className='flex items-center gap-2'>
          <RadioGroupItem value='weekly' id='rg-perm-weekly' />
          <Label htmlFor='rg-perm-weekly'>Weekly</Label>
        </div>
        <div className='flex items-center gap-2'>
          <RadioGroupItem value='monthly' id='rg-perm-monthly' />
          <Label htmlFor='rg-perm-monthly'>Monthly</Label>
        </div>
      </RadioGroup>
      <p id='rg-permission-reason' className='text-xs text-tertiary-token'>
        Only the account owner can change the payout schedule.
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The whole group is disabled for a viewer without rights; the current choice stays visible and the reason is linked with aria-describedby.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <RadioGroup
      dir='rtl'
      aria-label='تكرار الإشعارات'
      defaultValue='weekly'
      className='w-56'
    >
      <div className='flex items-start gap-2'>
        <RadioGroupItem
          value='instant'
          id='rg-rtl-instant'
          className='mt-0.5'
        />
        <Label htmlFor='rg-rtl-instant' className='leading-snug'>
          فورًا، في كل مرة يحفظ فيها أحد المعجبين إصدارًا أو يشاركه
        </Label>
      </div>
      <div className='flex items-start gap-2'>
        <RadioGroupItem value='weekly' id='rg-rtl-weekly' className='mt-0.5' />
        <Label htmlFor='rg-rtl-weekly' className='leading-snug'>
          ملخص أسبوعي
        </Label>
      </div>
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic options in a narrow right-to-left group: radios sit at the start edge, labels wrap beside them, and arrow keys follow the reading direction.',
      },
    },
  },
};
