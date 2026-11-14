import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthBrandPanel } from './AuthBrandPanel';

const meta = {
  title: 'Features/Auth/AuthBrandPanel',
  component: AuthBrandPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AuthBrandPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headline: 'Your living identity on the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
};

export const TextHidden: Story = {
  args: {
    headline: 'Your living identity on the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
    showText: false,
  },
};

/** A caller that passes a headline and no description: the panel drops the body line. */
export const PartialHeadlineOnly: Story = {
  args: {
    headline: 'Be found. Be understood.',
    description: '',
  },
};

/** A long headline and description balance inside the panel's text column. */
export const LongContent: Story = {
  args: {
    headline:
      'Every release, every link and every fan conversation in one living profile',
    description:
      'Your music, your shows, your merch, your mailing list and your next chapter, together in one Jovie profile that keeps itself current while you are on the road.',
  },
};

/** The panel inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    headline: 'Your living identity on the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
