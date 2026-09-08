import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getComparison } from '@/content/comparisons';
import { ComparisonPageContent } from './ComparisonPageContent';

const linktreeComparison = getComparison('linktree');

if (!linktreeComparison) {
  throw new Error('Missing canonical linktree comparison fixture');
}

const meta = {
  title: 'Marketing/Fixtures/ComparisonPageContent',
  component: ComparisonPageContent,
  parameters: {
    layout: 'fullscreen',
    pen: {
      registryId: 'web-027-compare--[slug]',
      route: '/compare/linktree',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
    },
    docs: {
      description: {
        component:
          'Deterministic production-backed body for web-027. The story uses the same ComparisonPageContent component and checked-in linktree comparison data as /compare/linktree; route metadata and JSON-LD remain route-owned.',
      },
    },
  },
  args: {
    data: linktreeComparison,
  },
} satisfies Meta<typeof ComparisonPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web027CompareLinktree: Story = {
  name: 'web-027 /compare/linktree',
};
