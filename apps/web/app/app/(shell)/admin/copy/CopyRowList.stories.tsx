import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyRowList } from './CopyRowList';

const rows = [
  {
    id: 'HOME-3',
    route: '/',
    section: 'Hero',
    role: 'h2',
    text: 'The link your music deserves.',
    source: 'apps/web/data/artistProfileCopy.ts:430',
  },
  {
    id: 'HOME-4',
    route: '/',
    section: 'Hero',
    role: 'body',
    text: 'Your music, artist bio, and social links in one free profile.',
    source: 'apps/web/data/artistProfileCopy.ts:432',
  },
  {
    id: 'SL-2',
    route: '/smart-links',
    section: 'SmartLinksLanding',
    role: 'cta',
    text: 'Create a Smart Link',
    source: 'apps/web/app/(marketing)/smart-links/SmartLinksLanding.tsx:62',
  },
];

const meta = {
  title: 'Features/Admin/CopyRowList',
  component: CopyRowList,
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  args: { rows, verdicts: {} },
} satisfies Meta<typeof CopyRowList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Unreviewed: Story = {};
export const Reviewed: Story = {
  args: {
    verdicts: {
      'HOME-3': { verdict: 'sucks', note: 'too long' },
      'HOME-4': { verdict: 'great', note: '' },
      'SL-2': { verdict: 'meh', note: 'say it plainer' },
    },
  },
};
export const Empty: Story = { args: { rows: [] } };
