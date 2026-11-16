import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { ChangelogSubscribeColumn } from './ChangelogSubscribeColumn';
import '@/app/(marketing)/changelog/changelog-editorial.css';

const meta = {
  title: 'Marketing/Fixtures/ChangelogSubscribeColumn States',
  component: ChangelogSubscribeColumn,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithPageHeader(Story) {
      return (
        <section className='min-h-screen bg-base py-16 text-primary-token'>
          <MarketingContainer width='page'>
            <div className='border-t border-subtle pt-14'>
              <Story />
            </div>
          </MarketingContainer>
        </section>
      );
    },
  ],
} satisfies Meta<typeof ChangelogSubscribeColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the flush-start module in an Arabic document direction. */
export const RtlDocument: Story = {
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
