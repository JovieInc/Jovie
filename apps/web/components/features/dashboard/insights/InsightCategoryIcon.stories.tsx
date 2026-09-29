import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { InsightCategory } from '@/types/insights';
import { InsightCategoryIcon } from './InsightCategoryIcon';

const CATEGORIES: InsightCategory[] = [
  'geographic',
  'growth',
  'content',
  'revenue',
  'tour',
  'platform',
  'engagement',
  'timing',
];

const meta = {
  title: 'Dashboard/Insights/InsightCategoryIcon',
  component: InsightCategoryIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    category: 'growth',
  },
  argTypes: {
    category: {
      control: 'select',
      options: CATEGORIES,
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
} satisfies Meta<typeof InsightCategoryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: 'sm' },
};

export const AllCategories: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      {CATEGORIES.map(category => (
        <InsightCategoryIcon key={category} category={category} />
      ))}
    </div>
  ),
};
