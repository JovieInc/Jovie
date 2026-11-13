import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DEFAULT_RING_LIGHT } from '@/lib/teleprompter/ring-light';
import { StudioLightPanel } from './StudioLightPanel';

const meta = {
  title: 'Features/TeleprompterStudio/StudioLightPanel',
  component: StudioLightPanel,
  parameters: { layout: 'centered', themes: { themeOverride: 'dark' } },
  args: {
    settings: DEFAULT_RING_LIGHT,
    onChange: () => {},
  },
} satisfies Meta<typeof StudioLightPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Edges: Story = {};
export const FullWhite: Story = {
  args: { settings: { ...DEFAULT_RING_LIGHT, mode: 'full', warmth: 0.2 } },
};
export const Rtl: Story = {
  render: args => (
    <div dir='rtl'>
      <StudioLightPanel {...args} />
    </div>
  ),
};
