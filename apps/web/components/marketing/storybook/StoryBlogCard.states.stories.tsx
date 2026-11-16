import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { STORY_BLOG_POSTS } from './fixtures';
import { marketingCenteredParameters } from './marketingStoryMeta';
import { StoryBlogCard } from './StoryBlogCard';

const POST = STORY_BLOG_POSTS[0];

const meta = {
  title: 'Marketing/Fixtures/StoryBlogCard States',
  component: StoryBlogCard,
  parameters: marketingCenteredParameters,
  decorators: [
    function WithCardColumn(Story) {
      return (
        <div className='mx-auto max-w-md p-8'>
          <Story />
        </div>
      );
    },
  ],
  args: { post: POST, variant: 'default' },
} satisfies Meta<typeof StoryBlogCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long title and category stay whole across several lines. */
export const LongContentTitle: Story = {
  args: {
    post: {
      ...POST,
      title:
        'A much longer editorial title that must remain complete and readable across several lines without truncating the article name',
      category: 'Music Business and Artist Management',
    },
  },
};

/** Right-to-left: an Arabic title and category in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    post: {
      ...POST,
      title: 'مشكلة جهات الاتصال',
      category: 'إدارة الفنانين',
      author: 'تيم وايت',
    },
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
