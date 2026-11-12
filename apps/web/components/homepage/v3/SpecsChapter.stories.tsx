import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecsChapter } from './SpecsChapter';
import './stage.css';
import './product-ui.css';
import './surfaces.css';
import './chapters.css';
import './specs.css';
import './responsive.css';

/** 03 specs: registry-derived numbers, then the ⌘K and inspector moments. */
const meta = {
  title: 'Marketing/Homepage v3/SpecsChapter',
  component: SpecsChapter,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof SpecsChapter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** Right-to-left: the specs sheet and moments inside an RTL document. */
export const RtlDocument: Story = {
  render: () => (
    <div dir='rtl'>
      <SpecsChapter />
    </div>
  ),
};
