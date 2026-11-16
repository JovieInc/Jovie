import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { LegalDocument } from '@/lib/legal/getLegalDocument';
import { LegalPage } from './LegalPage';

/**
 * State coverage for the legal page. These render the same LegalPage as
 * LegalPage.stories.tsx and change only the document, the support copy or the
 * document direction.
 */
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
  title: 'Organisms/LegalPage States',
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

const LONG_SUPPORT =
  'Questions about this policy, a data request, or anything else about how we handle your account and your fans? Write to the team and include the page you were reading so we can answer in one reply.';

/** Long content: a long title, summary and support description. */
export const LongContentPolicy: Story = {
  args: {
    doc: {
      ...doc,
      title: 'Privacy Policy and Fan Data Processing Terms for Artists',
      practicalSummary:
        'The short version runs long on purpose: you own your fan data, we process it only to run Jovie, and you can export or delete it at any time from your settings.',
    } as LegalDocument,
    supportDescription: LONG_SUPPORT,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_SUPPORT)).toBeVisible();
  },
};

/** Right-to-left: an Arabic legal page inside an RTL document. */
export const RtlArabicPolicy: Story = {
  args: {
    doc: {
      ...doc,
      title: 'سياسة الخصوصية',
      practicalSummary: 'باختصار: بياناتك ملك لك.',
    } as LegalDocument,
    supportDescription: 'هل لديك أسئلة حول هذه السياسة؟ فريقنا سعيد بالمساعدة.',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'سياسة الخصوصية' })
    ).toBeVisible();
  },
};
