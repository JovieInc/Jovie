import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ActivityAction, ActivityEvent } from '@/lib/activity/types';
import { ActivityFeed } from './ActivityFeed';

const ACTIONS: ActivityAction[] = [
  'created',
  'updated',
  'enriched',
  'linked',
  'synced',
  'published',
  'imported',
  'verified',
];

function event(
  index: number,
  overrides: Partial<ActivityEvent> = {}
): ActivityEvent {
  return {
    id: `event-${index}`,
    entityType: 'release',
    entityId: `release-${index}`,
    action: ACTIONS[index % ACTIONS.length],
    description: `Release links were refreshed for track ${index + 1}.`,
    createdAt: new Date(Date.UTC(2026, 7, 31 - index, 18, 0)),
    actor: { type: 'user', name: 'Avery' },
    ...overrides,
  };
}

/** Rendered states of the activity feed, beside ActivityFeed.stories.tsx. */
const meta = {
  title: 'Molecules/ActivityFeed States',
  component: ActivityFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 max-w-full bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    events: [event(0)],
  },
} satisfies Meta<typeof ActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: events with no actor, so no system name joins the timestamp. */
export const PartialNoActor: Story = {
  args: {
    events: [
      event(0, { actor: undefined }),
      event(1, { actor: undefined, action: 'deleted' }),
    ],
  },
};

/** Long content: a long feed with a description that wraps several lines. */
export const LongContentManyEvents: Story = {
  args: {
    events: [
      event(0, {
        actor: { type: 'system', name: 'Jovie' },
        description:
          'Jovie enriched the audience summary with listener locations, top cities, playlist adds and the fans who saved every release this month.',
      }),
      ...Array.from({ length: 11 }, (_, index) => event(index + 1)),
    ],
  },
};

/** Right-to-left: Arabic descriptions on a right-to-left page. */
export const RtlArabicEvents: Story = {
  args: {
    events: [
      event(0, {
        actor: { type: 'system', name: 'جوفي' },
        description: 'تم نشر روابط الإصدار الجديد.',
      }),
      event(1, { description: 'تم تحديث بيانات الملف الشخصي.' }),
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
