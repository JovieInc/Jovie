import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProductDemoCarousel } from './ProductDemoCarousel';

const meta = {
  title: 'Features/Demo/ProductDemoCarousel',
  component: ProductDemoCarousel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ProductDemoCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function RtlDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Rtl: the frame, caption overlay and dots mirror without overflow. */
export const RtlCarousel: Story = {
  decorators: [RtlDecorator],
};
