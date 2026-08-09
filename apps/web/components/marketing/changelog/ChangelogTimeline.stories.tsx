import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import { ChangelogTimeline } from './ChangelogTimeline';

const BOUNDED_RELEASES: readonly ChangelogRelease[] = [
  {
    version: '26.7.0',
    date: '2026-07-21',
    summary: 'A focused set of **public-facing** workflow improvements.',
    sections: {
      added: ['**Release workspace:** keeps status and links together.'],
      changed: ['Profile cards share one `responsive` spacing contract.'],
      fixed: ['Compact layouts keep their labels visible.'],
      removed: [],
    },
  },
  {
    version: '26.6.0',
    date: '2026-06-28',
    summary: 'Reliability and accessibility refinements.',
    sections: {
      added: [],
      changed: ['Keyboard focus follows the visible reading order.'],
      fixed: ['Empty states remain stable at narrow widths.'],
      removed: [],
    },
  },
];

const meta = {
  title: 'Marketing/Fixtures/ChangelogTimeline',
  component: ChangelogTimeline,
  parameters: {
    layout: 'fullscreen',
    chromatic: { pauseAnimationAtEnd: true },
    pen: {
      registryId: 'web-026-changelog',
      contractId: 'V1OpUm',
      sourceSha: '0892cccf39d72c62890ad4bc797cfd6f2d651af6',
      receipts: {
        desktop: { id: 'uX3V7', width: 1024, height: 1200 },
        narrow: { id: 'mEYIa', width: 390, height: 844 },
      },
    },
    docs: {
      description: {
        component:
          'Deterministic, static reduced-motion state for Pen registry web-026-changelog (contract V1OpUm). Two neutral releases bound the entry count and story height; the production route remains the source of the hero and signup, so ChangelogEmailSignup and Turnstile are intentionally absent.',
      },
    },
  },
  decorators: [
    Story => (
      <section className='min-h-screen bg-page py-16 text-primary-token'>
        <MarketingContainer width='page'>
          <div className='marketing-divider mb-10' />
          <Story />
        </MarketingContainer>
      </section>
    ),
  ],
  args: {
    releases: BOUNDED_RELEASES,
  },
} satisfies Meta<typeof ChangelogTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web026Changelog: Story = {
  name: 'web-026-changelog / bounded timeline',
};

export const Empty: Story = {
  args: { releases: [] },
};
