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
