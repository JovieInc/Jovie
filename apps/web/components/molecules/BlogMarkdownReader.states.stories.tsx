import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlogMarkdownReader } from './BlogMarkdownReader';

const longSection = (index: number) => `
  <h2>Step ${index}: keep every service in step</h2>
  <p>Each release page lists every service an artist distributes to, so a fan who taps the link lands on the right player without a second search. The page refreshes as new services pick up the release.</p>
  <ol>
    <li>Confirm the release date with your distributor.</li>
    <li>Check that every service lists the same artwork and credits.</li>
  </ol>
`;

/** Rendered states of the long-form reader, beside BlogMarkdownReader.stories.tsx. */
const meta = {
  title: 'Molecules/BlogMarkdownReader States',
  component: BlogMarkdownReader,
  parameters: {
    layout: 'padded',
  },
  args: {
    html: '<p>Jovie is building the fastest way for artists to launch a link-in-bio.</p>',
  },
} satisfies Meta<typeof BlogMarkdownReader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a document with no body yet renders an empty reader frame. */
export const EmptyDocument: Story = {
  args: {
    html: '',
  },
};

/** Long content: many sections, a table and a code block. */
export const LongContentArticle: Story = {
  args: {
    className: 'max-w-2xl',
    html: `
      <p>This guide walks through a full release, from the first upload to the day it goes live everywhere.</p>
      ${[1, 2, 3, 4].map(longSection).join('')}
      <table>
        <thead><tr><th>Service</th><th>Status</th></tr></thead>
        <tbody><tr><td>Spotify</td><td>Live</td></tr><tr><td>Apple Music</td><td>Pending</td></tr></tbody>
      </table>
      <pre><code>https://jov.ie/artist/release-name-with-a-very-long-slug-that-keeps-going</code></pre>
    `,
  },
};

/** Right-to-left: an Arabic article on a right-to-left page. */
export const RtlArabicArticle: Story = {
  args: {
    html: `
      <p>نحن نبني أسرع طريقة للفنانين لإطلاق صفحة روابطهم.</p>
      <h2>لماذا تهم السرعة</h2>
      <ul><li>اختر اسم المستخدم</li><li>اربط خدمات البث</li></ul>
    `,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
