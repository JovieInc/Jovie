import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { ChangelogSubscribeColumn } from './ChangelogSubscribeColumn';
import '@/app/(marketing)/changelog/changelog-editorial.css';

const meta = {
  title: 'Marketing/Fixtures/ChangelogSubscribeColumn',
  component: ChangelogSubscribeColumn,
  parameters: {
    layout: 'fullscreen',
    pen: {
      registryId: 'web-026-changelog',
      contractId: 'o5CeaF',
      docs: {
        description: {
          component:
            'Changelog page-header subscribe module: the canonical ChangelogEmailSignup set flush left beside the page title. Deterministic static state; Turnstile renders in its unconfigured local state.',
        },
      },
    },
  },
  decorators: [
    Story => (
      <section className='min-h-screen bg-base py-16 text-primary-token'>
        <MarketingContainer width='page'>
          <div className='border-t border-subtle pt-14'>
            <Story />
          </div>
        </MarketingContainer>
      </section>
    ),
  ],
} satisfies Meta<typeof ChangelogSubscribeColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SubscribeColumn: Story = {
  name: 'changelog subscribe column',
};
