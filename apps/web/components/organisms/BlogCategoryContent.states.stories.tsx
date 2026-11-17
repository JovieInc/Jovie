import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { BlogCard } from '@/app/(marketing)/blog/components/BlogCard';
import type { ResolvedAuthor } from '@/lib/blog/presentation-contracts';
import { marketingFullscreenParameters } from '../marketing/storybook/marketingStoryMeta';
import { BlogCategoryContent } from './BlogCategoryContent';
import {
  BLOG_CATEGORY_STORY_CATEGORY,
  BLOG_CATEGORY_STORY_POST,
} from './BlogCategoryContent.stories';

const storyAuthor = {
  name: BLOG_CATEGORY_STORY_POST.author,
  avatarUrl: null,
  isVerified: false,
} satisfies ResolvedAuthor;

/**
 * State coverage for the blog category shell. These render the same
 * production BlogCard as the web-024 story and change only the category copy
 * or the document direction.
 */
const meta = {
  title: 'Marketing/Routes/BlogCategory States',
  component: BlogCategoryContent,
  parameters: marketingFullscreenParameters,
  args: {
    category: BLOG_CATEGORY_STORY_CATEGORY,
    hasPosts: true,
  },
  render: args => (
    <BlogCategoryContent {...args}>
      <BlogCard post={BLOG_CATEGORY_STORY_POST} author={storyAuthor} />
    </BlogCategoryContent>
  ),
} satisfies Meta<typeof BlogCategoryContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_NAME = 'Artist Management, Touring Logistics and Booking Agents';
const LONG_DESCRIPTION =
  'Insights on navigating the business side of music: managers, agents, lawyers, publishers, and the many overlapping systems that connect independent artists to every kind of opportunity, from the first booking to a full world tour.';

/** Long content: a long category name and description wrap in the hero. */
export const LongContentCategoryCopy: Story = {
  args: {
    category: {
      ...BLOG_CATEGORY_STORY_CATEGORY,
      name: LONG_NAME,
      description: LONG_DESCRIPTION,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: LONG_NAME })
    ).toBeVisible();
    await expect(canvas.getByText(LONG_DESCRIPTION)).toBeVisible();
  },
};

/** Right-to-left: the category shell inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: BLOG_CATEGORY_STORY_CATEGORY.name,
      })
    ).toBeVisible();
  },
};
