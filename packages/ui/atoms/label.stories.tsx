import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Label> = {
  title: 'UI/Atoms/Label',
  component: Label,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex flex-col gap-1'>
      <Label htmlFor='lbl-name'>Display name</Label>
      <Input id='lbl-name' />
    </div>
  ),
};

export const Required: Story = {
  render: () => (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor='lbl-req' required>
        Email
      </Label>
      <Input id='lbl-req' type='email' required aria-required='true' />
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className='grid gap-3'>
      <Label variant='default'>Default label</Label>
      <Label variant='muted'>Optional metadata</Label>
      <Label variant='error'>Resolve this field</Label>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: args => (
    <div className='flex flex-col gap-1.5'>
      <Label {...args} htmlFor='lbl-disabled'>
        Managed identity
      </Label>
      <Input id='lbl-disabled' value='Unavailable' disabled readOnly />
    </div>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <div className='flex w-72 flex-col gap-1.5'>
      <Label htmlFor='lbl-error' variant='error' required>
        Payout email
      </Label>
      <Input
        id='lbl-error'
        type='email'
        defaultValue='not-an-email'
        error='Enter a valid email address.'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The error variant paired with an invalid control so the label and the feedback share the destructive token.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='flex w-56 flex-col gap-1.5'>
      <Label htmlFor='lbl-long' required>
        The email address where we send payout receipts and tax documents
      </Label>
      <Input id='lbl-long' type='email' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long label in a narrow column wraps onto further lines inside the column, with the required marker kept beside the text.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='flex w-56 flex-col gap-1.5'>
      <Label htmlFor='lbl-rtl' required>
        البريد الإلكتروني الذي نرسل إليه إيصالات الدفع والمستندات الضريبية
      </Label>
      <Input id='lbl-rtl' type='email' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'An Arabic label in a narrow right-to-left column wraps from the start edge, with the required marker kept beside the text.',
      },
    },
  },
};
