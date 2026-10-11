import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SectionHeading } from './SectionHeading';

const meta = {
  title: 'Atoms/SectionHeading',
  component: SectionHeading,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Featured Artists',
  },
} satisfies Meta<typeof SectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LeftAligned: Story = {
  args: {
    align: 'left',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
  },
};

export const CustomHeadingLevel: Story = {
  name: 'Heading level (h3)',
  args: {
    level: 3,
    children: 'How it works',
  },
};
