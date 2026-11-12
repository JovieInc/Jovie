import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseCountdown } from './ReleaseCountdown';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const meta = {
  title: 'Features/Release/ReleaseCountdown',
  component: ReleaseCountdown,
  parameters: {
    layout: 'centered',
  },
  args: {
    releaseDate: new Date(Date.now() + TEN_DAYS_MS),
  },
} satisfies Meta<typeof ReleaseCountdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    compact: true,
  },
};

/** The release time has passed: the countdown renders nothing and refreshes. */
export const EmptyAfterRelease: Story = {
  args: {
    releaseDate: new Date(Date.now() - 60_000),
  },
};

/** Under a day left: the days column drops out. */
export const PartialUnderADay: Story = {
  args: {
    releaseDate: new Date(Date.now() + 3 * 60 * 60 * 1000 + 5 * 60 * 1000),
  },
};

/** A long custom label wraps above the digits. */
export const LongContentLabel: Story = {
  args: {
    label: 'Premieres worldwide on every streaming service in',
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};

/** The countdown inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    label: 'يصدر خلال',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
