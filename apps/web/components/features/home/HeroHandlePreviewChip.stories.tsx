import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeroHandlePreviewChip } from './HeroHandlePreviewChip';

const meta: Meta<typeof HeroHandlePreviewChip> = {
  title: 'Home/HeroHandlePreviewChip',
  component: HeroHandlePreviewChip,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof HeroHandlePreviewChip>;

export const Default: Story = {
  args: {
    fallbackHandle: 'yourhandle',
  },
  decorators: [
    Story => (
      <div className='text-lg font-medium'>
        jov.ie/
        <Story />
      </div>
    ),
  ],
};

export const CustomFallback: Story = {
  args: {
    fallbackHandle: 'artistname',
  },
  decorators: [
    Story => (
      <div className='text-lg font-medium'>
        jov.ie/
        <Story />
      </div>
    ),
  ],
};

export const InHeroContext: Story = {
  render: () => (
    <div className='p-8 bg-surface rounded-xl text-center space-y-4'>
      <h1 className='text-3xl font-bold'>Claim Your Handle</h1>
      <p className='text-xl text-secondary'>
        Your profile will be at{' '}
        <span className='font-semibold text-primary'>
          jov.ie/
          <HeroHandlePreviewChip fallbackHandle='yourname' />
        </span>
      </p>
    </div>
  ),
};
