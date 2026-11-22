import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TestimonialCard } from './TestimonialCard';

const meta = {
  title: 'Marketing/Sections/TestimonialCard',
  component: TestimonialCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TestimonialCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'Tim White',
    title: 'Artist',
    quote: 'Jovie keeps the release work in one place.',
    initials: 'TW',
  },
};

/** Partial: a quote with a single-letter avatar and the shortest title. */
export const PartialShortQuote: Story = {
  args: { name: 'Jo', title: 'DJ', quote: 'Fast.', initials: 'J' },
};

/** Long content: a quote and title far past one line. */
export const LongContentQuote: Story = {
  args: {
    name: 'Alexandra Montgomery-Fitzgerald',
    title: 'Independent artist, label owner and touring producer',
    quote:
      'Every release now gets its own page, its own links and its own plan, and I no longer rebuild the same checklist by hand before every single drop across every platform I release on.',
    initials: 'AM',
  },
};

/** Rtl: an Arabic quote inside a right-to-left container. */
export const RtlQuote: Story = {
  args: {
    name: 'ليلى الأحمد',
    title: 'فنانة مستقلة',
    quote: 'كل إصدار يحصل الآن على صفحته الخاصة وروابطه وخطته.',
    initials: 'ل',
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};

/** Empty: no quote copy yet, only the attribution. */
export const EmptyQuote: Story = {
  args: { name: 'Tim White', title: 'Artist', quote: '', initials: 'TW' },
};
