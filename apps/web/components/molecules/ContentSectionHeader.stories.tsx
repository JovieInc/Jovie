import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentSectionHeader } from './ContentSectionHeader';

const meta = {
  title: 'Molecules/ContentSectionHeader',
  component: ContentSectionHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [Story => <div className='w-[36rem]'>{Story()}</div>],
} satisfies Meta<typeof ContentSectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SectionHeading: Story = {
  args: {
    title: 'Catalog section',
    subtitle: 'The default section-level heading remains an h2.',
  },
};

export const RouteHeading: Story = {
  args: {
    headingLevel: 'h1',
    title: 'All artists',
    subtitle: 'Use the registered primitive as the route-level heading.',
  },
};

export const CompactPlainWithAction: Story = {
  args: {
    density: 'compact',
    variant: 'plain',
    title: 'Campaign controls',
    subtitle: 'Compact and responsive without creating a second owner.',
    actions: <Button size='sm'>Review</Button>,
  },
};

/** Partial: a title with no subtitle or actions keeps the header height. */
export const PartialTitleOnly: Story = {
  args: { title: 'Billing' },
};

/** Long content: a long title truncates instead of pushing the actions off the row. */
export const LongTitleTruncates: Story = {
  args: {
    title:
      'The Extraordinary Midnight Radio Orchestra and Friends — release campaign controls',
    subtitle: 'The title truncates; the action stays on the row.',
    actions: <Button size='sm'>Review</Button>,
  },
};

/** RTL: title and actions swap sides under a right-to-left document. */
export const RtlWithAction: Story = {
  args: {
    title: 'المطالبة بملفك الشخصي',
    subtitle: 'نور الهدى',
    actions: <Button size='sm'>متابعة</Button>,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        {Story()}
      </div>
    ),
  ],
};
