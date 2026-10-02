import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlogMarkdownReader } from './BlogMarkdownReader';

const sampleHtml = `
  <p>Jovie is building the fastest way for artists to launch a link-in-bio.</p>
  <h2>Why speed matters</h2>
  <p>Every extra step between a fan and a stream costs plays.</p>
  <blockquote><p>Ship the smallest thing that proves the idea.</p></blockquote>
  <ul>
    <li>Pick a handle</li>
    <li>Connect your DSPs</li>
    <li>Share one link</li>
  </ul>
`;

const meta = {
  title: 'Molecules/BlogMarkdownReader',
  component: BlogMarkdownReader,
  parameters: {
    layout: 'padded',
  },
  args: {
    html: sampleHtml,
  },
} satisfies Meta<typeof BlogMarkdownReader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCustomClassName: Story = {
  args: {
    className: 'max-w-2xl',
  },
};
