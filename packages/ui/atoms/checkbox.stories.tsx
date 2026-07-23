import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Checkbox } from './checkbox';
import { Label } from './label';

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Atoms/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Checkbox id='cb-default' />
      <Label htmlFor='cb-default'>Subscribe</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => <Checkbox id='cb-checked' defaultChecked />,
};

export const Disabled: Story = {
  render: () => (
    <div className='flex flex-col gap-2'>
      <Checkbox id='cb-dis' disabled />
      <Checkbox id='cb-dis-checked' disabled defaultChecked />
    </div>
  ),
};
