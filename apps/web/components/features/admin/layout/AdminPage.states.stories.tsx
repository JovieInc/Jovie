import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminPage, type AdminPageProps } from './AdminPage';

const meta = {
  title: 'Features/Admin/Layout/AdminPage States',
  component: AdminPage,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/app/ov/shipping' } },
  },
  args: { title: 'Shipping', testId: 'admin-page' },
} satisfies Meta<typeof AdminPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: content only, with no toolbar, hero, tabs or route views. */
export const PartialContentOnly: Story = {
  args: {
    children: <p className='text-app text-secondary-token'>Report content</p>,
  },
};

const SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const longParagraphs = SECTIONS.map(section => (
  <p key={section} className='text-app text-secondary-token'>
    Section {section}. The merge queue held for a required check while three
    preview floods ran back to back, so production builds waited behind them
    until the queue drained and the release-day window had already opened.
  </p>
));

/** Long content: route views, a hero and a document that scrolls. */
export const LongContentScrollingDocument: Story = {
  args: {
    title:
      'Shipping pipeline, product certification and release timeline for every repository',
    views: 'shipping',
    hero: (
      <section aria-label='Key Metrics' className='text-app text-primary-token'>
        48,213 merges in the last 7 days across Jovie, LogYourBody and
        summer-config
      </section>
    ),
    children: longParagraphs,
  },
};

function RtlPage(args: AdminPageProps) {
  return (
    <div dir='rtl' lang='ar'>
      <AdminPage {...args} />
    </div>
  );
}

/** RTL: the toolbar and content mirror in a right-to-left container. */
export const RtlPageContent: Story = {
  args: {
    title: 'الشحن',
    views: 'shipping',
    children: (
      <p className='text-app text-secondary-token'>
        توقفت قائمة الدمج بانتظار فحص مطلوب قبل فتح نافذة الإصدار.
      </p>
    ),
  },
  render: RtlPage,
};
