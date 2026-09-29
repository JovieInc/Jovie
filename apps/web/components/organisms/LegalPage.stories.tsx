import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LegalDocument } from '@/lib/legal/getLegalDocument';
import { LegalPage } from './LegalPage';

const doc = {
  slug: 'terms',
  title: 'Terms of Service',
  lastUpdated: 'September 1, 2026',
  practicalSummary:
    'The short version: use Jovie in good faith and keep your account secure.',
  toc: [{ id: 'overview', title: 'Overview', level: 2 }],
  html: '<h2 id="overview">Overview</h2><p>This document describes the terms of using Jovie.</p>',
} as unknown as LegalDocument;

const meta = {
  title: 'Organisms/LegalPage',
  component: LegalPage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    doc,
    contactEmail: 'privacy@jov.ie',
    supportDescription:
      'Questions about this policy? Our team is happy to help.',
  },
} satisfies Meta<typeof LegalPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
