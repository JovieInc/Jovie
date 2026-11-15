import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { TocEntry } from '@/types/docs';
import { DocPage } from './DocPage';

/**
 * State coverage for the public document reader. These render the same
 * DocPage as DocPage.stories.tsx and change only the document fields or the
 * document direction.
 */
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
  title: 'Organisms/DocPage States',
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

/** Empty: a short notice with no headings, so the contents list is empty. */
export const EmptyTableOfContents: Story = {
  args: {
    doc: {
      ...doc,
      title: 'Cookie Notice',
      toc: [],
      html: '<p>We only use the cookies needed to keep you signed in.</p>',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Cookie Notice' })
    ).toBeVisible();
  },
};

const longToc: TocEntry[] = Array.from({ length: 14 }, (_, index) => ({
  id: `section-${index + 1}`,
  title: `Section ${index + 1}: obligations, rights and remedies that apply to this part of the agreement`,
  level: 2,
}));

/** Long content: a long title, summary and fourteen long-titled sections. */
export const LongContentAgreement: Story = {
  args: {
    doc: {
      ...doc,
      title:
        'Jovie Artist Services, Data Processing and Acceptable Use Agreement',
      practicalSummary:
        'The short version runs long here on purpose: you keep ownership of your music and your fan data, we process it only to run the service, and either side can end the agreement with notice. Every section below says exactly how.',
      toc: longToc,
      html: longToc
        .map(
          entry =>
            `<h2 id="${entry.id}">${entry.title}</h2><p>${'This paragraph is deliberately long so the reader measure can be checked for wrapping. '.repeat(4)}</p>`
        )
        .join(''),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('heading', { level: 2 })).toHaveLength(14);
  },
};

/** Right-to-left: an Arabic document inside an RTL page. */
export const RtlArabicDocument: Story = {
  args: {
    doc: {
      ...doc,
      title: 'شروط الخدمة',
      practicalSummary: 'باختصار: استخدم جوفي بحسن نية وحافظ على أمان حسابك.',
      toc: [{ id: 'overview', title: 'نظرة عامة', level: 2 }],
      html: '<h2 id="overview">نظرة عامة</h2><p>توضح هذه الوثيقة شروط استخدام جوفي.</p>',
    },
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
      canvas.getByRole('heading', { level: 1, name: 'شروط الخدمة' })
    ).toBeVisible();
  },
};
