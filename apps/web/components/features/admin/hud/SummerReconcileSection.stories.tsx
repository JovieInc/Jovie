import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SummerReconcileSection } from './SummerReconcileSection';

const meta = {
  title: 'Features/Admin/Hud/SummerReconcileSection',
  component: SummerReconcileSection,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof SummerReconcileSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Indicated: Story = {
  args: {
    indicated: true,
  },
};

export const NotIndicated: Story = {
  args: {
    indicated: false,
  },
};
