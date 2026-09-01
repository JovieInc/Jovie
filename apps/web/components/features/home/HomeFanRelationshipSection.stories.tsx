import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeFanRelationshipSection } from './HomeFanRelationshipSection';

const meta = {
  title: 'Marketing/Sections/HomeFanRelationshipSection',
  component: HomeFanRelationshipSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeFanRelationshipSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
