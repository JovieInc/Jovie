import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicSurfaceHeader } from './PublicSurfaceHeader';

const meta = {
  title: 'Organisms/PublicSurface/PublicSurfaceHeader',
  component: PublicSurfaceHeader,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PublicSurfaceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithSlots: Story = {
  args: {
    leftSlot: (
      <Button type='button' variant='ghost' size='sm'>
        Back
      </Button>
    ),
    rightSlot: (
      <Button type='button' variant='ghost' size='sm'>
        Share
      </Button>
    ),
  },
};

export const WithCenterContent: Story = {
  args: {
    children: (
      <p className='text-center text-sm text-primary-token'>Midnight Drive</p>
    ),
  },
};

/** Only a back control: the right slot stays as an empty spacer. */
export const PartialLeftSlotOnly: Story = {
  args: {
    leftSlot: (
      <Button type='button' variant='ghost' size='sm'>
        Back
      </Button>
    ),
  },
};

/** A long release title between both controls truncates inside its slot. */
export const LongContentCenterTitle: Story = {
  args: {
    ...WithSlots.args,
    children: (
      <p className='truncate text-center text-sm text-primary-token'>
        Never Say A Word (Extended Club Mix) feat. The Los Angeles After Hours
        Orchestra
      </p>
    ),
  },
};

/** Slots mirror inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    ...WithSlots.args,
    children: (
      <p className='text-center text-sm text-primary-token'>منتصف الليل</p>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
