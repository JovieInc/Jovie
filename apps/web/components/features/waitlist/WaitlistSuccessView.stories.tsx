import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistSuccessView } from './WaitlistSuccessView';

const meta = {
  title: 'Marketing/Routes/Waitlist',
  component: WaitlistSuccessView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Exact authenticated confirmation body for web-214-waitlist. The /waitlist server route keeps auth-state resolution and redirects; only a persisted waitlist state renders this no-prop pending receipt. This is not the public recipe.waitlist composition, which remains a stub until an approved public body exists.',
      },
    },
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
    pen: {
      registryId: 'web-214-waitlist',
      route: '/waitlist',
      source: 'apps/web/components/features/waitlist/WaitlistSuccessView.tsx',
      sourceExport: 'WaitlistSuccessView',
      sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b',
      storyExport: 'Web214AuthenticatedPending',
      fixture: 'authenticated WAITLIST_PENDING',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof WaitlistSuccessView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web214AuthenticatedPending: Story = {
  name: 'web-214 /waitlist — authenticated pending',
  render: () => <WaitlistSuccessView />,
};
