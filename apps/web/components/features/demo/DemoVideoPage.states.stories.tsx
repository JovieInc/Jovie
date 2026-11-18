import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoVideoPage } from './DemoVideoPage';

/**
 * State coverage for the public demo video page. The canonical story stays in
 * DemoVideoPage.stories.tsx.
 */
const meta = {
  title: 'Features/Demo/DemoVideoPage States',
  component: DemoVideoPage,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DemoVideoPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the page inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
