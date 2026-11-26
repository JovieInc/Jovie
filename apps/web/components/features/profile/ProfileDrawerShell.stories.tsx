import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileDrawerShell } from './ProfileDrawerShell';

const longTitle =
  'A very long drawer title that should truncate cleanly across the header without shifting the equal 44px controls';
const rtlTitle = 'قائمة الملف الشخصي للفنان';

const meta = {
  title: 'Profile/ProfileDrawerShell',
  component: ProfileDrawerShell,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'subtitle',
        'onBack',
        'navigationLevel',
        'contentClassName',
        'bodyClassName',
        'dataTestId',
        'centerTitle',
        'floating',
        'anchorRef',
      ],
    },
  },
  args: {
    open: true,
    onOpenChange: () => undefined,
    title: 'Menu',
    presentation: 'modal' as const,
    children: (
      <p className='text-sm text-secondary-token'>
        Share Profile · Pay · Contact
      </p>
    ),
  },
} satisfies Meta<typeof ProfileDrawerShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const LongContentTitle: Story = {
  args: {
    title: longTitle,
    navigationLevel: 'direct',
  },
};

export const RtlOverflowTitle: Story = {
  args: {
    title: rtlTitle,
    navigationLevel: 'direct',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
