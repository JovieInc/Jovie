import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import { CertificationFiltersMenu } from './CertificationFiltersMenu';

const inventory = fixtureInventory();

/** State coverage for the certification filters menu. */
const meta = {
  title: 'Features/Admin/Certifications/CertificationFiltersMenu States',
  component: CertificationFiltersMenu,
  parameters: { layout: 'centered' },
  args: {
    rows: inventory.rows,
    domains: inventory.domains,
    domain: 'all',
    owner: 'all',
    freshness: 'all',
    blockers: 'all',
    onDomainChange: fn(),
    onOwnerChange: fn(),
    onFreshnessChange: fn(),
    onBlockersChange: fn(),
  },
} satisfies Meta<typeof CertificationFiltersMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: many long owner names and every filter active. */
export const LongContentOwners: Story = {
  args: {
    rows: inventory.rows.flatMap((row, index) =>
      [0, 1, 2].map(copy => ({
        ...row,
        id: `${row.id}-${copy}`,
        owner: `Design systems and certification working group ${index * 3 + copy + 1}`,
      }))
    ),
    domain: 'flows',
    owner: 'Design systems and certification working group 1',
    freshness: 'stale',
    blockers: 'blocked',
  },
};

/** Right-to-left: the trigger inside an RTL document. */
export const RtlDocument: Story = {
  args: { rows: inventory.rows.map(row => ({ ...row, owner: 'ليلى' })) },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
