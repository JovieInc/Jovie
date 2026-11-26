import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminTableHeader, AdminTableSubheader } from './AdminTableHeader';

const meta = {
  title: 'Features/Admin/AdminTableHeader/States',
  component: AdminTableHeader,
  parameters: { layout: 'fullscreen' },
  args: { title: 'Creators', subtitle: '1,204 profiles claimed this month' },
} satisfies Meta<typeof AdminTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a header whose subtitle has nothing to count yet. */
export const EmptySubtitle: Story = {
  args: { subtitle: 'No profiles yet' },
};

/** Partial: the title and subtitle only, with no actions. */
export const PartialNoActions: Story = {};

/** Long content: a title and subtitle that must truncate. */
export const LongContentTitle: Story = {
  args: {
    title:
      'Creators awaiting manual verification across every connected platform',
    subtitle:
      'Profiles claimed this month that still need a human review before they can go live',
  },
};

/** Right-to-left: an Arabic header. */
export const RtlHeader: Story = {
  args: { title: 'المبدعون', subtitle: '1,204 ملفًا' },
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

/** Partial: a subheader with only a start slot. */
export const PartialSubheaderStartOnly: Story = {
  render: () => (
    <AdminTableSubheader start={<span className='text-sm'>Filters</span>} />
  ),
};
