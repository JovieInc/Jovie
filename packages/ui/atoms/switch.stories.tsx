import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './label';
import { Switch } from './switch';

const meta: Meta<typeof Switch> = {
  title: 'UI/Atoms/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Switch id='sw-default' />
      <Label htmlFor='sw-default'>Notifications</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => <Switch id='sw-on' defaultChecked />,
};

export const Disabled: Story = {
  render: () => (
    <div className='flex gap-3'>
      <Switch id='sw-off-dis' disabled />
      <Switch id='sw-on-dis' disabled defaultChecked />
    </div>
  ),
};
