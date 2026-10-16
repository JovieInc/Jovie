import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import {
  CertificationEvidenceStrip,
  CertificationIdentity,
} from './CertificationSummary';

const inventory = fixtureInventory();
const meta = {
  title: 'Features/Admin/Certifications/CertificationSummary',
  component: CertificationIdentity,
  parameters: { layout: 'centered' },
  args: { row: inventory.rows[0]! },
  render: ({ row }) => (
    <div className='space-y-2 rounded-md border border-subtle bg-base p-4 text-primary-token'>
      <CertificationIdentity row={row} />
      <CertificationEvidenceStrip row={row} />
    </div>
  ),
} satisfies Meta<typeof CertificationIdentity>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Current: Story = {};
export const Blocked: Story = { args: { row: inventory.rows[1]! } };
export const StaleApproval: Story = {
  args: { row: { ...inventory.rows[0]!, staleFounderLock: true } },
};
