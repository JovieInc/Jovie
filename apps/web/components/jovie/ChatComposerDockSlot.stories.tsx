import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatComposerDockSlot } from './ChatComposerDockSlot';

const meta = {
  title: 'Jovie/Chat/ChatComposerDockSlot',
  component: ChatComposerDockSlot,
  parameters: { layout: 'padded', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof ChatComposerDockSlot>;
export default meta;
type Story = StoryObj<typeof meta>;

const card = (
  <div className='mb-2 rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'>
    Summer asks · 1 of 4
  </div>
);

export const WithCard: Story = { args: { children: card } };
export const Empty: Story = { args: { children: null } };
export const Measured: Story = { args: { children: card, measure: true } };

export const LongContent: Story = {
  args: {
    children: (
      <div className='mb-2 rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'>
        Summer asks · approve the weekend campaign that pauses the
        lowest-converting channel and moves its budget to the two best audiences
      </div>
    ),
  },
};
export const RtlOverflow: Story = {
  args: {
    children: (
      <div
        dir='rtl'
        className='mb-2 rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
      >
        سؤال من سمر · الموافقة على حملة نهاية الأسبوع
      </div>
    ),
  },
};
