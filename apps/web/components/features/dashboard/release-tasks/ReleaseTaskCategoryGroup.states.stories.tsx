import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseTaskCategoryGroup } from './ReleaseTaskCategoryGroup';

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskCategoryGroup/States',
  component: ReleaseTaskCategoryGroup,
  parameters: { layout: 'padded' },
  render: function CategoryGroupFrame(args) {
    return (
      <div className='w-96 rounded-lg border border-subtle'>
        <ReleaseTaskCategoryGroup {...args} />
      </div>
    );
  },
  args: {
    category: 'Marketing',
    done: 2,
    total: 5,
    defaultOpen: true,
    children: (
      <div className='space-y-1 px-4 py-2 text-app text-secondary-token'>
        <p>Pitch playlist editors</p>
        <p>Notify core fans</p>
      </div>
    ),
  },
} satisfies Meta<typeof ReleaseTaskCategoryGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a category with no tasks yet, open with nothing to list. */
export const EmptyCategory: Story = {
  args: { done: 0, total: 0, children: null },
};

/** Partial: only the required props; open and done state come from defaults. */
export const PartialDefaults: Story = {
  args: { defaultOpen: undefined, allDone: undefined },
};

/** Long content: a long category name and many tasks in a narrow column. */
export const LongContentCategory: Story = {
  args: {
    category:
      'Playlist pitching, editorial outreach and every press contact before release day',
    done: 12,
    total: 48,
    children: (
      <div className='space-y-1 px-4 py-2 text-app text-secondary-token'>
        {Array.from({ length: 12 }, (_, i) => `curator-${i + 1}`).map(id => (
          <p key={id}>Follow up with {id}</p>
        ))}
      </div>
    ),
  },
};

/** Right-to-left: an Arabic category in an Arabic document direction. */
export const RtlArabicCategory: Story = {
  args: {
    category: 'التسويق',
    children: (
      <div className='space-y-1 px-4 py-2 text-app text-secondary-token'>
        <p>تواصل مع محرري قوائم التشغيل</p>
      </div>
    ),
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
