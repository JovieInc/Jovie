import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AcquisitionCapture } from './AcquisitionCapture';

const meta = {
  title: 'Tracking/AcquisitionCapture',
  component: AcquisitionCapture,
  parameters: {
    docs: {
      description: {
        component:
          'Renderless first-touch acquisition capture. It remains inactive until analytics consent is granted.',
      },
    },
  },
} satisfies Meta<typeof AcquisitionCapture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AwaitingConsent: Story = {};
