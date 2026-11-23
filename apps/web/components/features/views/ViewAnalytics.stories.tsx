import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ViewSignupCard } from './ViewAnalytics';

const meta = {
  title: 'Features/Views/ViewSignupCard',
  component: ViewSignupCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ViewSignupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
