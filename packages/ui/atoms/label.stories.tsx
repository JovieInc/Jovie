import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './label';
import { Input } from './input';

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
    <Label htmlFor='lbl-req' required>
      Email
    </Label>
  ),
};
