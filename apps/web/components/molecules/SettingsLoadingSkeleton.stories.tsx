import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  InputSkeleton,
  SettingsButtonSkeleton,
  SettingsLoadingSkeleton,
} from './SettingsLoadingSkeleton';

const meta = {
  title: 'Molecules/SettingsLoadingSkeleton',
  component: SettingsLoadingSkeleton,
  parameters: {
    layout: 'padded',
  },
  args: {
    children: (
      <>
        <InputSkeleton />
        <InputSkeleton width='w-2/3' />
        <SettingsButtonSkeleton />
      </>
    ),
  },
} satisfies Meta<typeof SettingsLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomWidths: Story = {
  args: {
    titleWidth: 'w-32',
    descriptionWidth: 'w-56',
  },
};
