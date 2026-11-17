import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeRelationshipPanel } from './HomeRelationshipPanel';

const meta = {
  title: 'Features/Home/HomeRelationshipPanel States',
  component: HomeRelationshipPanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomeRelationshipPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rtl: the decorative fan list in a right-to-left document. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
