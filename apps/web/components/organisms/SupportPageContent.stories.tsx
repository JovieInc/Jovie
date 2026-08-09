import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from '../marketing/storybook/marketingStoryMeta';
import { SupportPageContent } from './SupportPageContent';

const meta = {
  title: 'Marketing/Routes/Support',
  component: SupportPageContent,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Exact production presentation for web-040-support. Metadata, revalidation, FAQ and breadcrumb schema construction, and both JSON-LD scripts remain route-owned. Section taxonomy and manifest evidence remain owner-stacked and are not claimed by this story.`,
      },
    },
    pen: {
      registryId: 'web-040-support',
      route: '/support',
      source: 'apps/web/components/organisms/SupportPageContent.tsx',
      sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SupportPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web040Support: Story = {};
