import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SwipeToReveal, SwipeToRevealGroup } from './SwipeToReveal';

const Actions = () => (
  <>
    <Button
      type='button'
      variant='ghost'
      className='h-full w-10 rounded-none bg-info text-app text-white'
    >
      Edit
    </Button>
    <Button
      type='button'
      variant='ghost'
      className='h-full w-10 rounded-none bg-error text-app text-white'
    >
      Delete
    </Button>
  </>
);

const Row = ({ label }: { label: string }) => (
  <div className='flex h-14 items-center bg-surface-1 px-4 text-app text-primary-token'>
    {label}
  </div>
);

/**
 * `SwipeToReveal` only activates its drag gesture on touch devices (or with
 * `forceEnabled`). Storybook runs in a pointer-driven browser, so
 * `forceEnabled` is used below to render the touch layout for review;
 * dragging the row left reveals the action buttons.
 */
const meta = {
  title: 'Atoms/SwipeToReveal',
  component: SwipeToReveal,
  parameters: {
    layout: 'centered',
  },
  args: {
    actionsWidth: 80,
    actions: <Actions />,
    children: <Row label='Spotify' />,
    onOpen: fn(),
    onClose: fn(),
  },
  decorators: [
    Story => (
      <div className='w-80 overflow-hidden rounded-md border border-subtle'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SwipeToReveal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NonTouch: Story = {
  name: 'Non-touch (renders children only)',
  args: {
    forceEnabled: false,
  },
};

export const TouchEnabled: Story = {
  name: 'Touch-enabled (drag left to reveal)',
  args: {
    forceEnabled: true,
  },
};

export const Grouped: Story = {
  name: 'Grouped (only one open at a time)',
  render: args => (
    <SwipeToRevealGroup>
      <div className='divide-y divide-subtle'>
        <SwipeToReveal {...args} itemId='row-1'>
          <Row label='Spotify' />
        </SwipeToReveal>
        <SwipeToReveal {...args} itemId='row-2'>
          <Row label='Apple Music' />
        </SwipeToReveal>
      </div>
    </SwipeToRevealGroup>
  ),
  args: {
    forceEnabled: true,
  },
};
