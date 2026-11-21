import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FounderDemoRecordingSurface } from './FounderDemoRecordingSurface';

/** State coverage for the founder recording surface; its canonical story is in FounderDemoRecordingSurface.stories.tsx. */
const meta = {
  title: 'Features/Demo/FounderDemoRecordingSurface States',
  component: FounderDemoRecordingSurface,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FounderDemoRecordingSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlDocumentDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

/** Right-to-left: the recording inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [RtlDocumentDecorator],
};
