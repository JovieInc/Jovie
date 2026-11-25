import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FooterLink } from './FooterLink';

const meta = {
  title: 'Atoms/FooterLink/States',
  component: FooterLink,
  parameters: { layout: 'centered' },
  args: { href: '/privacy' },
  render: function FooterLinkStatesRender(args) {
    return (
      <div className='w-64 rounded-md bg-base px-2 py-2'>
        <FooterLink {...args} />
      </div>
    );
  },
} satisfies Meta<typeof FooterLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a link with no label yet keeps its hit area. */
export const EmptyLabel: Story = { args: { children: null } };

/** Partial: only the required href and label, every option left at its default. */
export const PartialRequiredOnly: Story = {
  args: { children: 'Privacy Policy' },
};

/** Long content: a label that wraps inside a narrow footer column. */
export const LongContentWrapsLabel: Story = {
  args: {
    href: '/legal/acceptable-use-and-community-guidelines',
    children:
      'Acceptable use, community guidelines and creator content policy for every Jovie profile',
  },
};

/** Right-to-left: an Arabic label on an external link. */
export const RtlExternalLink: Story = {
  args: {
    href: 'https://status.jov.ie',
    tone: 'light',
    children: 'سياسة الخصوصية وشروط الاستخدام',
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
