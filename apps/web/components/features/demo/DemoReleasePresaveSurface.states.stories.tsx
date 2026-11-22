import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleasePresaveSurface } from './DemoReleasePresaveSurface';

/** Rendered states of the Deep End smart link demo. */
const meta = {
  title: 'Features/Demo/DemoReleasePresaveSurface/States',
  component: DemoReleasePresaveSurface,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DemoReleasePresaveSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Rtl: the hero, badge and provider buttons mirror without overflow. */
export const RtlSmartLink: Story = {
  decorators: [RtlDecorator],
};
