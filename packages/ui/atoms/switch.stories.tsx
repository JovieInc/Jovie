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
  render: () => (
    <div className='flex items-center gap-2'>
      <Switch id='sw-on' defaultChecked />
      <Label htmlFor='sw-on'>Notifications enabled</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className='grid gap-4'>
      <div className='flex items-center gap-2'>
        <Switch id='sw-off-dis' disabled />
        <Label htmlFor='sw-off-dis'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch id='sw-on-dis' disabled defaultChecked />
        <Label htmlFor='sw-on-dis'>Disabled and enabled</Label>
      </div>
    </div>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <div className='grid gap-4'>
      <div className='flex items-center gap-2'>
        <Switch id='sw-matrix-off' />
        <Label htmlFor='sw-matrix-off'>Off</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch id='sw-matrix-on' defaultChecked />
        <Label htmlFor='sw-matrix-on'>On</Label>
      </div>
    </div>
  ),
};
