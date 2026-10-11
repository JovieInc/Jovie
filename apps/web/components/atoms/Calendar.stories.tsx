import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { Calendar } from './Calendar';

/**
 * `Calendar` is a `next/dynamic`, client-only wrapper around
 * {@link ./CalendarInner} (react-day-picker). See `CalendarInner.stories.tsx`
 * for the full themed calendar surface — this story covers the lazy-load
 * wrapper contract itself.
 */
const meta = {
  title: 'Atoms/Calendar',
  component: Calendar,
  parameters: {
    layout: 'centered',
  },
  args: {
    mode: 'single',
  },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelectedDate: Story = {
  args: {
    selected: new Date('2026-01-15T00:00:00.000Z'),
    onSelect: fn(),
  },
};
