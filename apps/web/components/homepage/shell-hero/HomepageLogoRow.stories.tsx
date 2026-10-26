import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageLogoRow } from './HomepageLogoRow';

const meta: Meta<typeof HomepageLogoRow> = {
  title: 'Marketing/Homepage/HomepageLogoRow',
  component: HomepageLogoRow,
};

export default meta;
type Story = StoryObj<typeof meta>;

/** No grant for "/" exists, so the slot renders nothing. */
export const NoGrants: Story = {};
