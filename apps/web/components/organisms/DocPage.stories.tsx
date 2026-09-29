import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TocEntry } from '@/types/docs';
import { DocPage } from './DocPage';

const toc: TocEntry[] = [
  { id: 'overview', title: 'Overview', level: 2 },
  { id: 'your-rights', title: 'Your rights', level: 2 },
];

const doc = {
  title: 'Terms of Service',
  lastUpdated: 'September 1, 2026',
  practicalSummary:
    'The short version: use Jovie in good faith and keep your account secure.',
  toc,
  html: '<h2 id="overview">Overview</h2><p>This document describes the terms of using Jovie.</p><h2 id="your-rights">Your rights</h2><p>You retain ownership of your content.</p>',
};

const meta = {
  title: 'Organisms/DocPage',
  component: DocPage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    doc,
    pdfTitle: 'Jovie Terms of Service',
  },
} satisfies Meta<typeof DocPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
