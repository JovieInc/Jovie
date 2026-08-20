import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentSurfaceCard } from './ContentSurfaceCard';

const meta = {
  title: 'Molecules/ContentSurfaceCard',
  component: ContentSurfaceCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[34rem] max-w-[calc(100vw-2rem)] bg-surface-0 p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: 'Content surface',
    className: 'p-4',
  },
} satisfies Meta<typeof ContentSurfaceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SurfaceVariants: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-3'>
      {(['default', 'details', 'marketing', 'settings', 'table'] as const).map(
        surface => (
          <ContentSurfaceCard key={surface} surface={surface} className='p-4'>
            <p className='text-sm font-medium capitalize'>{surface}</p>
          </ContentSurfaceCard>
        )
      )}
    </div>
  ),
};

export const Nested: Story = {
  render: () => (
    <ContentSurfaceCard className='space-y-3 p-4'>
      <p className='text-sm font-medium'>Outer content surface</p>
      <ContentSurfaceCard surface='nested' className='p-3'>
        <p className='text-sm text-secondary-token'>Nested content surface</p>
      </ContentSurfaceCard>
    </ContentSurfaceCard>
  ),
};

export const SemanticAndInteractive: Story = {
  render: () => (
    <div className='grid gap-3'>
      <ContentSurfaceCard as='section' className='p-4' aria-label='Summary'>
        <p className='text-sm'>Semantic section</p>
      </ContentSurfaceCard>
      <ContentSurfaceCard
        as='button'
        className='p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55'
        onClick={() => undefined}
      >
        <span className='text-sm font-medium'>Native button surface</span>
      </ContentSurfaceCard>
    </div>
  ),
};
