import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

const meta: Meta = {
  title: 'UI/Atoms/Select',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Select defaultValue='pro'>
      <SelectTrigger className='w-48' aria-label='Plan'>
        <SelectValue placeholder='Pick a plan' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='free'>Free</SelectItem>
        <SelectItem value='pro'>Pro</SelectItem>
        <SelectItem value='team' disabled>
          Team
        </SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled defaultValue='pro'>
      <SelectTrigger className='w-48' aria-label='Plan'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='pro'>Pro</SelectItem>
      </SelectContent>
    </Select>
  ),
};
