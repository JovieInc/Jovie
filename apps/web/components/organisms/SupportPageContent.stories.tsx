import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from '../marketing/storybook/marketingStoryMeta';
import { SupportPageContent } from './SupportPageContent';

export const SUPPORT_STORY_RECEIPT = {
  registryId: 'web-040-support',
  route: '/support',
  source: 'apps/web/components/organisms/SupportPageContent.tsx',
  sourceExport: 'SupportPageContent',
  storyExport: 'Web040Support',
  sourceSha: '70cb3b51b852a25213911ffe78cc81c35a73f788',
  proofScope: 'system-b-body-only',
  implementation: 'exact-production-body',
} as const;

const meta = {
  title: 'Marketing/Routes/Support',
  component: SupportPageContent,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Exact System B production body for web-040-support. This story owns the shared body only; route metadata, revalidation, FAQ and breadcrumb schema construction, JSON-LD scripts, section taxonomy, and manifest evidence remain route- or owner-stacked.`,
      },
    },
    pen: {
      ...SUPPORT_STORY_RECEIPT,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SupportPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web040Support: Story = {};
