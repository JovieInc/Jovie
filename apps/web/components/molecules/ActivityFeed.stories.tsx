import { CheckCircle2 } from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ActivityEvent } from '@/lib/activity/types';
import {
  ActivityFeed,
  ActivityTimelineIcon,
  ActivityTimelineMeta,
  ActivityTimelineRow,
  ActivityTimelineTimestamp,
} from './ActivityFeed';

const activityEvents = [
  {
    id: 'event-1',
    entityType: 'profile',
    entityId: 'profile-story',
    action: 'enriched',
    description: 'Jovie enriched the profile audience summary.',
    createdAt: new Date('2026-08-31T18:20:00.000Z'),
    actor: { type: 'system', name: 'Jovie' },
  },
  {
    id: 'event-2',
    entityType: 'release',
    entityId: 'release-story',
    action: 'published',
    description: 'Release links were published for Midnight Drive.',
    createdAt: new Date('2026-08-31T17:05:00.000Z'),
    actor: { type: 'user', name: 'Avery' },
  },
] satisfies ActivityEvent[];

const meta = {
  title: 'Molecules/ActivityFeed',
  component: ActivityFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[24rem] max-w-[calc(100vw-2rem)] bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    events: activityEvents,
    emptyMessage: 'No activity yet.',
    isLoading: false,
  },
} satisfies Meta<typeof ActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentActivity: Story = {};

export const Loading: Story = {
  args: {
    events: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    events: [],
    emptyMessage: 'Activity will appear once Jovie starts working.',
  },
};

export const PrimitiveRowContract: Story = {
  render: () => (
    <ActivityTimelineRow
      as='div'
      leading={
        <ActivityTimelineIcon>
          <CheckCircle2
            className='h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
        </ActivityTimelineIcon>
      }
    >
      <p className='text-app leading-[18px] text-primary-token tracking-tight'>
        Metadata agent approved the merch launch copy.
      </p>
      <ActivityTimelineMeta>
        <ActivityTimelineTimestamp dateTime='2026-08-31T18:20:00.000Z'>
          1h ago
        </ActivityTimelineTimestamp>
      </ActivityTimelineMeta>
    </ActivityTimelineRow>
  ),
};
