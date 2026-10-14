import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { StarRating } from './StarRating';

const meta = {
  title: 'Features/Admin/Lists/StarRating',
  component: StarRating,
  parameters: { layout: 'centered' },
  args: { value: 3, label: 'Rating for Ava', onChange: fn() },
} satisfies Meta<typeof StarRating>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rated: Story = {};

export const Unrated: Story = { args: { value: null } };

export const Disabled: Story = { args: { disabled: true } };
