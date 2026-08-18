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
