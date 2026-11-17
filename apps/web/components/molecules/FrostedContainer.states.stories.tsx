import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FrostedContainer } from './FrostedContainer';

const meta = {
  title: 'Molecules/FrostedContainer/States',
  component: FrostedContainer,
  parameters: { layout: 'fullscreen' },
  args: { children: null },
} satisfies Meta<typeof FrostedContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only children, with every optional prop left at its default. */
export const PartialDefaultsOnly: Story = {
  args: {
    children: <p className='p-8 text-primary-token'>Welcome back.</p>,
  },
};

/** Long content: a long paragraph wraps inside the glass card. */
export const LongContentParagraph: Story = {
  args: {
    variant: 'glass',
    className: 'mx-auto mt-16 max-w-md',
    children: (
      <p className='p-8 text-secondary-token'>
        Create your artist profile, connect every streaming service, collect fan
        emails at every show and keep every release page, pre-save link and tour
        date in step from one place, without a second tool or a spreadsheet on
        the side.
      </p>
    ),
  },
};

/** RTL: Arabic copy inside the solid card. */
export const RtlArabicCopy: Story = {
  args: {
    variant: 'solid',
    className: 'mx-auto mt-16 max-w-md',
    children: (
      <div dir='rtl' lang='ar' className='p-8 text-primary-token'>
        أنشئ ملفك الفني وتواصل مع المعجبين في كل مكان.
      </div>
    ),
  },
};
