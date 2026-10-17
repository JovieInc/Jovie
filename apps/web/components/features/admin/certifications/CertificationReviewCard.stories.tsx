import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import { CertificationReviewCard } from './CertificationReviewCard';

const inventory = fixtureInventory();
const meta = {
  title: 'Features/Admin/Certifications/CertificationReviewCard',
  component: CertificationReviewCard,
  parameters: { layout: 'centered' },
  args: {
    row: { ...inventory.rows[0]!, owner: 'Summer' },
    card: inventory.queue.needsYou[0]!.card,
  },
  decorators: [
    Story => (
      <div className='w-80 rounded-md border border-subtle bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CertificationReviewCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ReviewReady: Story = {};
export const WithoutBrief: Story = {
  args: { row: inventory.rows[1]!, card: null },
};
