import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPhoneImage } from './MarketingPhoneImage';

const meta = {
  title: 'Marketing/MarketingPhoneImage',
  component: MarketingPhoneImage,
  parameters: {
    layout: 'centered',
  },
  args: {
    scenarioId: 'tim-white-profile-live-mobile',
    width: 320,
    height: 693,
  },
} satisfies Meta<typeof MarketingPhoneImage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sized: Story = {};

export const Fill: Story = {
  decorators: [
    Story => (
      <div style={{ position: 'relative', width: 240, height: 520 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    fill: true,
    width: undefined,
    height: undefined,
  },
};
