import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeBentoPairs } from './HomeBentoPairs';

const meta = {
  title: 'Marketing/Sections/HomeBentoPairs',
  component: HomeBentoPairs,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeBentoPairs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
