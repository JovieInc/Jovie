import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProductDemoCarousel } from './ProductDemoCarousel';

const meta = {
  title: 'Features/Demo/ProductDemoCarousel',
  component: ProductDemoCarousel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story: () => React.JSX.Element) => (
      <div className='w-full max-w-4xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductDemoCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function RtlDocumentDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-4xl'>
      <Story />
    </div>
  );
}

/** Right-to-left: the carousel inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [RtlDocumentDecorator],
};
