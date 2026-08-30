import type { Meta, StoryObj } from '@storybook/react';
import { HomepageClosedLoop } from './HomepageClosedLoop';

const meta = {
  title: 'Marketing/HomepageClosedLoop',
  component: HomepageClosedLoop,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomepageClosedLoop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
