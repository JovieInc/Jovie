import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof Popover> = {
  title: 'Atoms/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex justify-center'>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant='secondary'>More info</Button>
        </PopoverTrigger>
        <PopoverContent sideOffset={8} align='center'>
          <p className='text-sm text-gray-700 dark:text-gray-200'>
            Share your profile link and grow your fanbase.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};
