import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DemoShell } from './DemoShell';

/**
 * State coverage for the static demo shell. The canonical story stays in
 * DemoShell.stories.tsx; these change only the slotted content, the details
 * panel or the document direction.
 */
const meta = {
  title: 'Features/Demo/DemoShell States',
  component: DemoShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    activeTab: 'releases',
    onTabChange: fn(),
    children: (
      <div className='p-6 text-sm text-secondary-token'>Demo shell content</div>
    ),
  },
} satisfies Meta<typeof DemoShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the main area has no content yet. */
export const EmptyMain: Story = {
  args: { children: null },
};

/** Partial: the shell with its details panel open beside the content. */
export const PartialWithDetailsPanel: Story = {
  args: {
    rightPanel: (
      <div className='p-4 text-sm text-secondary-token'>Release details</div>
    ),
  },
};

/** Long content: a long main body that wraps inside the shell. */
export const LongContentMain: Story = {
  args: {
    activeTab: 'catalog-views',
    children: (
      <div className='max-w-2xl p-6 text-sm leading-6 text-secondary-token'>
        Every release in the catalog with its stores, links, artwork and
        campaign status. This deliberately long paragraph runs several lines so
        the main area can be checked for clean wrapping next to the sidebar and
        under the toolbar at every width, without the header or tabs moving.
      </div>
    ),
  },
};

/** Right-to-left: the shell inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    children: (
      <div className='p-6 text-sm text-secondary-token'>محتوى العرض</div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
