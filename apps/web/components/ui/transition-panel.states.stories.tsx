import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TransitionPanel } from './transition-panel';

const meta = {
  title: 'UI/TransitionPanel/States',
  component: TransitionPanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TransitionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only the first panel is present while later steps stay empty. */
export const PartialFirstStep: Story = {
  args: {
    activeIndex: 0,
    children: [<p key='a'>Find You</p>, <p key='b'> </p>, <p key='c'> </p>],
  },
};

/** Long content: a long hint wraps inside the active panel. */
export const LongContentHint: Story = {
  args: {
    activeIndex: 1,
    children: [
      <p key='a'>Find You</p>,
      <p key='b'>
        The handle people type to reach you, including a very long clarifying
        sentence that must wrap without shifting the composer below.
      </p>,
      <p key='c'>Go Live</p>,
    ],
  },
};

/** Right to left: panel copy under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: {
    activeIndex: 0,
    children: [
      <p key='a'>ابحث عنك عبر الاسم أو الرابط</p>,
      <p key='b'>اطلب اسمك</p>,
      <p key='c'>انشر صفحتك</p>,
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-80 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};
