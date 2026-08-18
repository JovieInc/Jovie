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
  render: () => (
    <div className='flex items-center gap-2'>
      <Checkbox id='cb-checked' defaultChecked />
      <Label htmlFor='cb-checked'>Subscribed</Label>
    </div>
  ),
};

export const Indeterminate: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Checkbox id='cb-indeterminate' checked='indeterminate' />
      <Label htmlFor='cb-indeterminate'>Some tracks selected</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className='grid gap-3'>
      <div className='flex items-center gap-2'>
        <Checkbox id='cb-dis' disabled />
        <Label htmlFor='cb-dis'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox id='cb-dis-checked' disabled defaultChecked />
        <Label htmlFor='cb-dis-checked'>Disabled and checked</Label>
      </div>
    </div>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <div className='grid gap-4'>
      {[
        { id: 'cb-matrix-off', label: 'Unchecked' },
        { id: 'cb-matrix-on', label: 'Checked', checked: true },
        {
          id: 'cb-matrix-mixed',
          label: 'Indeterminate',
          checked: 'indeterminate' as const,
        },
      ].map(item => (
        <div className='flex items-center gap-2' key={item.id}>
          <Checkbox id={item.id} checked={item.checked} />
          <Label htmlFor={item.id}>{item.label}</Label>
        </div>
      ))}
    </div>
  ),
};
