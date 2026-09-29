import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { QRCodeCard } from './QRCodeCard';

const meta = {
  title: 'Features/Home/QRCodeCard',
  component: QRCodeCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Generates its QR code via api.qrserver.com at render time — the real production behavior, no mock.',
      },
    },
  },
  args: {
    handle: TIM_WHITE_PROFILE.handle,
  },
} satisfies Meta<typeof QRCodeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
