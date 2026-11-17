import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { InsightsPanelView } from './InsightsPanel';

const meta = {
  title: 'Dashboard/Insights/Workspace',
  component: InsightsPanelView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/app/insights' } },
  },
  args: {
    insights: [],
    isLoading: false,
    error: null,
    selectedCategory: 'all',
    onCategoryChange: fn(),
    onGenerate: fn(),
    onRetry: fn(),
    isGenerating: false,
  },
  render: args => (
    <div className='flex h-[42rem] bg-base'>
      <InsightsPanelView {...args} />
    </div>
  ),
} satisfies Meta<typeof InsightsPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Loading: Story = {
  args: { isLoading: true },
};

export const ErrorState: Story = {
  args: { error: new Error('Insights request failed') },
};

export const EmptyNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const NotEnoughActivity: Story = {
  args: { lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 6 } },
};

export const NothingNew: Story = {
  args: { lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 1240 } },
};

export const GenerateFailed: Story = {
  args: { generateFailed: true },
};

export const CoolingDown: Story = {
  args: {
    generateFailed: true,
    generateFailure: { status: 429, nextAllowedAt: null },
  },
};

export const NeedsPlan: Story = {
  args: { generateFailed: true, generateFailure: { status: 403 } },
};

export const EmptyCategory: Story = {
  args: { selectedCategory: 'tour' },
};
