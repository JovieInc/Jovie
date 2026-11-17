import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { FooterNavigation } from './FooterNavigation';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='bg-surface-0 p-4'>
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
  title: 'Molecules/FooterNavigation States',
  component: FooterNavigation,
  parameters: {
    layout: 'centered',
  },
  args: {
    variant: 'light',
  },
  decorators: [CanvasFrame],
} satisfies Meta<typeof FooterNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the owner passes no links, so the landmark renders with nothing in it. */
export const EmptyNoLinks: Story = {
  args: {
    links: [],
  },
};

/** Partial: a footer that only lists one legal page. */
export const PartialSingleLink: Story = {
  args: {
    links: [{ href: '/legal/privacy', label: 'Privacy' }],
  },
};

/** Long content: many links with long labels in a narrow footer. */
export const LongContentManyLinks: Story = {
  args: {
    className: 'max-w-xs flex-wrap',
    links: [
      { href: '/legal/privacy', label: 'Privacy Policy' },
      { href: '/legal/terms', label: 'Terms of Service' },
      { href: '/legal/cookies', label: 'Cookie Preferences and Choices' },
      { href: '/legal/dmca', label: 'Copyright and DMCA Notices' },
      { href: '/support', label: 'Help Center and Support' },
    ],
  },
};

/** Right-to-left: Arabic link labels inside an RTL document. */
export const RtlArabicLinks: Story = {
  args: {
    ariaLabel: 'روابط التذييل',
    links: [
      { href: '/legal/privacy', label: 'الخصوصية' },
      { href: '/legal/terms', label: 'الشروط' },
    ],
  },
  decorators: [RtlFrame],
};
