import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Inbox } from 'lucide-react';
import { SettingsErrorState } from '@/components/features/dashboard/molecules/SettingsErrorState';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';

// Card intent contract (.claude/rules/ui.md): empty, loading and error states
// sit flat on the canvas. No card, border or recessed well around them.
function FlatStatesGallery() {
  return (
    <div
      className='grid w-[min(56rem,calc(100vw-2rem))] gap-8 bg-(--app-shell-content-surface) p-6 sm:grid-cols-2'
      data-testid='flat-states-gallery'
    >
      <section aria-label='Empty state' className='min-h-64'>
        <EmptyState
          heading='No Contacts Yet'
          description='Add bookings, management, and press contacts.'
          icon={<Inbox className='h-5 w-5' aria-hidden='true' />}
          presentation='workspace'
        />
      </section>
      <section aria-label='Error state' className='min-h-64'>
        <SettingsErrorState onRetry={() => undefined} />
      </section>
      <section aria-label='Metric loading state'>
        <ContentMetricCardSkeleton />
      </section>
      <section aria-label='List loading state'>
        <LoadingSkeleton lines={4} />
      </section>
    </div>
  );
}

const meta: Meta<typeof FlatStatesGallery> = {
  title: 'Design System/Contracts/Flat States',
  component: FlatStatesGallery,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};
