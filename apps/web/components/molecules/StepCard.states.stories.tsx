import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { StepCard } from './StepCard';

const LinkIcon = (
  <svg
    className='h-6 w-6'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
    />
  </svg>
);

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='w-80'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Atoms/StepCard States',
  component: StepCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    stepNumber: '01',
    title: 'Connect Your Spotify',
    description:
      'Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.',
    icon: LinkIcon,
  },
} satisfies Meta<typeof StepCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only the required props, so defaults fill the rest. */
export const PartialRequiredOnly: Story = {};

/** Long content: a long title and description wrap in the card. */
export const LongContentWrappedCopy: Story = {
  args: {
    title:
      'Connect every streaming profile and distributor account you already use',
    description:
      'Search and verify your Spotify, Apple Music and YouTube artist profiles, then connect your distributor so Jovie can pull every release, single and remix automatically and keep them in step as new music goes live.',
  },
};

/** Right-to-left: Arabic copy inside an RTL document. */
export const RtlArabicCopy: Story = {
  args: {
    title: 'اربط حسابك على سبوتيفاي',
    description: 'ابحث عن ملفك الفني وتحقق منه في ثوانٍ.',
  },
  decorators: [RtlFrame],
};
