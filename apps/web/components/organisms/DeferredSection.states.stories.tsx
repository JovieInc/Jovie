import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { DeferredSection } from './DeferredSection';

/**
 * State coverage for the viewport-deferred wrapper. It renders whatever the
 * caller passes once the section scrolls near the viewport; these change only
 * how much the caller passes or the document direction.
 */
const meta = {
  title: 'Organisms/DeferredSection States',
  component: DeferredSection,
  parameters: {
    layout: 'padded',
  },
  args: {
    placeholderHeight: 320,
    children: null,
  },
} satisfies Meta<typeof DeferredSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_PARAGRAPHS = Array.from(
  { length: 6 },
  (_, index) =>
    `Paragraph ${index + 1}: deferred sections hold below-the-fold marketing content, so this copy runs long on purpose to show the wrapper grows with its children instead of clipping them at the placeholder height.`
);

/** Long content: children taller than the reserved placeholder. */
export const LongContentChildren: Story = {
  args: {
    placeholderHeight: 160,
    children: (
      <div className='space-y-3 rounded-lg border border-subtle bg-surface-1 p-8 text-primary-token'>
        {LONG_PARAGRAPHS.map(paragraph => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(LONG_PARAGRAPHS[5])).toBeVisible();
  },
};

/** Right-to-left: deferred Arabic content inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle bg-surface-1 p-8 text-primary-token'>
        محتوى مؤجل
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('محتوى مؤجل')).toBeVisible();
  },
};
