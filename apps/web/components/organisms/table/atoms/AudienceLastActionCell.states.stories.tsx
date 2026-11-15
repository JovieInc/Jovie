import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AudienceAction } from '@/types';
import { AudienceLastActionCell } from './AudienceLastActionCell';

const actions: AudienceAction[] = [
  { label: 'Clicked Spotify link', platform: 'spotify' },
];

/** State coverage for the last-action cell. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceLastActionCell States',
  component: AudienceLastActionCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    actions,
    lastSeenAt: '2026-09-01T12:00:00.000Z',
  },
} satisfies Meta<typeof AudienceLastActionCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no action and no last-seen time renders nothing. */
export const EmptyNoActivity: Story = {
  args: {
    actions: [],
    lastSeenAt: null,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toBeNull();
  },
};

/** Partial: an action with no last-seen time shows the label alone. */
export const PartialNoTimestamp: Story = {
  args: {
    lastSeenAt: null,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Clicked Spotify Link')
    ).toBeVisible();
  },
};

/** Long content: a long action label truncates inside a narrow column. */
export const LongContentLabel: Story = {
  args: {
    actions: [
      {
        label:
          'Clicked the limited summer tour merch bundle link from the newsletter',
      },
    ],
  },
  decorators: [
    function NarrowColumn(Story) {
      return (
        <div className='w-48'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: the action and its time inside an RTL document. */
export const RtlAction: Story = {
  args: {
    actions: [{ label: 'نقر على رابط Spotify' }],
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
