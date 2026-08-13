import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from '../marketing/storybook/marketingStoryMeta';
import { AboutPageContent } from './AboutPageContent';

export const ABOUT_STORY_RECEIPT = {
  registryId: 'web-016-about',
  route: '/about',
  source: 'apps/web/components/organisms/AboutPageContent.tsx',
  sourceExport: 'AboutPageContent',
  storyExport: 'Web016About',
  sourceAuditBaseSha: 'c767a55d279c69fbddb32324f78faced8938884c',
  containingMergeSha: '841866b0a7891bb064958af2cbbdf09b3cd3b1b3',
  proofScope: 'system-b-body-only',
  implementation: 'exact-production-body',
} as const;

const meta = {
  title: 'Marketing/Routes/About',
  component: AboutPageContent,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Exact System B production body for web-016-about. This story owns the shared body only; route metadata, revalidation, FAQ, organization and breadcrumb schema construction, JSON-LD scripts, section taxonomy, and manifest evidence remain route- or owner-stacked.`,
      },
    },
    pen: {
      ...ABOUT_STORY_RECEIPT,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AboutPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web016About: Story = {};
