import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthBranding } from './AuthBranding';

/**
 * State coverage for the auth brand panel wrapper. The canonical stories stay
 * in AuthBranding.stories.tsx; these change only the copy, the text toggle or
 * the document direction.
 */
const meta = {
  title: 'Auth/AuthBranding States',
  component: AuthBranding,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    title: 'Your living identity on the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
} satisfies Meta<typeof AuthBranding>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the panel with its headline and description hidden. */
export const PartialTextHidden: Story = {
  args: { showText: false },
};

/** Long content: a headline and description several lines long. */
export const LongContentCopy: Story = {
  args: {
    title:
      'Your living identity on the internet, with every release, show, link and fan in one place that stays yours',
    description:
      'Your work, your links, your next chapter, your merch, your tour dates and every new release. Together in your Jovie profile, kept current for you so fans always land on the right thing.',
  },
};

/** Right-to-left: the panel inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    title: 'هويتك الحية على الإنترنت.',
    description: 'أعمالك وروابطك وفصلك التالي. معًا في ملفك على Jovie.',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
