import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskDescriptionHelper } from './TaskDescriptionHelper';

const meta = {
  title: 'Features/Dashboard/Tasks/TaskDescriptionHelper/States',
  component: TaskDescriptionHelper,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['helper', 'onBeginEditing'] },
  },
  args: { onBeginEditing: () => undefined },
} satisfies Meta<typeof TaskDescriptionHelper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a helper with a title and one intro line and no bullets or links. */
export const EmptyTitleOnly: Story = {
  args: { helper: { title: 'Describe the task', intro: [] } },
};

/** Long content: many long bullets and a link that must wrap. */
export const LongContentBullets: Story = {
  args: {
    helper: {
      title: 'What to include in a very detailed release description',
      intro: [
        'Add a short summary of the release, the story behind it and anything the team needs to know before launch day arrives.',
      ],
      bullets: [
        'The release date and the time zone it applies to, including any regional staggering of the launch',
        'The primary artist and every featured artist with the exact spelling they want shown',
      ],
      links: [
        {
          href: 'https://example.com/guides/release-descriptions',
          label: 'Read the full guide to writing release descriptions',
        },
      ],
      footer: 'You can edit this description at any time.',
    },
  },
};

/** Rtl: an Arabic helper inside a right-to-left container. */
export const RtlHelper: Story = {
  args: {
    helper: {
      title: 'ما الذي يجب تضمينه',
      intro: ['أضف ملخصاً قصيراً للإصدار.'],
      bullets: ['تاريخ الإصدار', 'الفنان الرئيسي'],
    },
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='relative h-48 w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};
