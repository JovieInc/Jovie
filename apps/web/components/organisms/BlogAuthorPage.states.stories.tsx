import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { BlogAuthorPage } from './BlogAuthorPage';
import { Web023BlogAuthor } from './BlogAuthorPage.stories';

/**
 * State coverage for the blog author body. These reuse the canonical web-023
 * hero and article cards and change only how many cards the route passes or
 * the document direction.
 */
const meta = {
  title: 'Public Catalog/BlogAuthorPage States',
  component: BlogAuthorPage,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
  args: Web023BlogAuthor.args,
  render: args => <BlogAuthorPage {...args} />,
} satisfies Meta<typeof BlogAuthorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const cards = Web023BlogAuthor.args?.articleCards;

/** Long content: three pages of articles in the two-column grid. */
export const LongContentManyArticles: Story = {
  args: {
    articleCount: 12,
    articleCards: (
      <>
        {cards}
        {cards}
        {cards}
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 2, name: '12 articles' })
    ).toBeVisible();
  },
};

/** Right-to-left: the author body inside an RTL document. */
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
      canvas.getByRole('heading', { level: 2, name: '4 articles' })
    ).toBeVisible();
  },
};
