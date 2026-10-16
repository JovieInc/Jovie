import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import { CertificationFiltersMenu } from './CertificationFiltersMenu';

const inventory = fixtureInventory();
const meta = {
  title: 'Features/Admin/Certifications/CertificationFiltersMenu',
  component: CertificationFiltersMenu,
  parameters: { layout: 'centered' },
  args: {
    rows: inventory.rows.map(row => ({ ...row, owner: 'Summer' })),
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
  render: function Filters(args) {
    const [, updateArgs] = useArgs();
    return (
      <CertificationFiltersMenu
        {...args}
        onDomainChange={domain => updateArgs({ domain })}
        onOwnerChange={owner => updateArgs({ owner })}
        onFreshnessChange={freshness => updateArgs({ freshness })}
        onBlockersChange={blockers => updateArgs({ blockers })}
      />
    );
  },
} satisfies Meta<typeof CertificationFiltersMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Filtered: Story = {
  args: {
    domain: 'flows',
    owner: 'Summer',
    freshness: 'stale',
    blockers: 'blocked',
  },
};
export const Empty: Story = { args: { rows: [], domains: [] } };
