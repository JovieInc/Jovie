import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeatureCard } from './FeatureCard';

const BoltIcon = (
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
      d='M13 10V3L4 14h7v7l9-11h-7z'
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
  title: 'Atoms/FeatureCard States',
  component: FeatureCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    title: '3.2x Faster Loading',
    description: 'Fans discover your music instantly. No waiting, no bouncing.',
    metric: '3.2x faster',
    icon: BoltIcon,
  },
} satisfies Meta<typeof FeatureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no metric badge, so the description follows the title. */
export const PartialWithoutMetric: Story = {
  args: {
    metric: undefined,
  },
};

/** Long content: a long title, badge and description wrap in the card. */
export const LongContentWrappedCopy: Story = {
  args: {
    title:
      'Every release page, smart link and pre-save campaign ready on release day',
    metric: 'Ready in under a minute for every new release',
    description:
      'Jovie builds the release page, the smart link for every streaming service and the pre-save campaign from your catalog, then keeps each of them in step as dates, artwork and credits change, so fans always land on the right place.',
  },
};

/** Right-to-left: Arabic copy inside an RTL document. */
export const RtlArabicCopy: Story = {
  args: {
    title: 'تحميل أسرع بثلاث مرات',
    metric: 'أسرع ٣٫٢ مرة',
    description: 'يكتشف المعجبون موسيقاك فورًا دون انتظار.',
  },
  decorators: [RtlFrame],
};
