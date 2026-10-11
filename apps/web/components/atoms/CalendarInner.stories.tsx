import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import CalendarInner from './CalendarInner';

/**
 * `CalendarInner` is the themed `react-day-picker` surface. It is lazy-loaded
 * by `./Calendar` (`next/dynamic`, `ssr: false`) so it never ships in the
 * initial bundle — stories render it directly to cover the real DOM/theming.
 */
const meta = {
  title: 'Atoms/CalendarInner',
  component: CalendarInner,
  parameters: {
    layout: 'centered',
  },
  args: {
    mode: 'single',
  },
} satisfies Meta<typeof CalendarInner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelectedDate: Story = {
  args: {
    selected: new Date('2026-01-15T00:00:00.000Z'),
    onSelect: fn(),
  },
};

export const WithDisabledPastDates: Story = {
  args: {
    disabled: { before: new Date('2026-01-15T00:00:00.000Z') },
  },
};
