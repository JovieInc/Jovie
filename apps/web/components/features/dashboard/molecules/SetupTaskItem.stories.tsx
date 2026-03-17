import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SetupTaskItem } from './SetupTaskItem';

const meta: Meta<typeof SetupTaskItem> = {
  title: 'Dashboard/Molecules/SetupTaskItem',
  component: SetupTaskItem,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof SetupTaskItem>;

export const Incomplete: Story = {
  args: {
    index: 1,
    title: 'Add your profile photo',
    complete: false,
    completeLabel: 'Photo uploaded',
    incompleteLabel: 'Upload a photo to personalize your profile',
    action: (
      <Button size='sm' variant='outline'>
        Upload
      </Button>
    ),
  },
  decorators: [
    Story => (
      <ul className='w-96 list-none p-0 m-0'>
        <Story />
      </ul>
    ),
  ],
};

export const Complete: Story = {
  args: {
    index: 1,
    title: 'Add your profile photo',
    complete: true,
    completeLabel: 'Photo uploaded',
    incompleteLabel: 'Upload a photo to personalize your profile',
  },
  decorators: [
    Story => (
      <ul className='w-96 list-none p-0 m-0'>
        <Story />
      </ul>
    ),
  ],
};

export const SetupChecklist: Story = {
  render: () => (
    <ul className='w-96 space-y-2 list-none p-0 m-0'>
      <SetupTaskItem
        index={1}
        title='Add your profile photo'
        complete={true}
        completeLabel='Photo uploaded'
        incompleteLabel='Upload a photo'
      />
      <SetupTaskItem
        index={2}
        title='Set your display name'
        complete={true}
        completeLabel='Name set'
        incompleteLabel='Add your name'
      />
      <SetupTaskItem
        index={3}
        title='Add your first link'
        complete={false}
        completeLabel='Link added'
        incompleteLabel='Add a music or social link'
        action={
          <Button size='sm' variant='outline'>
            Add Link
          </Button>
        }
      />
      <SetupTaskItem
        index={4}
        title='Share your profile'
        complete={false}
        completeLabel='Profile shared'
        incompleteLabel='Copy and share your profile URL'
        action={
          <Button size='sm' variant='outline'>
            Copy URL
          </Button>
        }
      />
    </ul>
  ),
};
