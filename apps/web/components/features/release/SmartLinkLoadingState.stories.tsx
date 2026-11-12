import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkLoadingState } from './SmartLinkLoadingState';

const meta = {
  title: 'Features/Release/SmartLinkLoadingState',
  component: SmartLinkLoadingState,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SmartLinkLoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The route fallback while a SmartLink page streams in (app/r/[slug]/loading). */
export const Loading: Story = {};

/** The same skeleton inside a right-to-left page. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
