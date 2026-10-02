import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AudienceTableStableProvider,
  AudienceTableVolatileProvider,
  useAudienceTableContext,
} from './AudienceTableContext';

/**
 * AudienceTableContext splits the audience table's shared state into a
 * stable slice (callbacks) and a volatile slice (selection + open menu) so
 * cells only re-render on the piece they actually read. This story wires
 * both providers and renders a consumer to document the combined shape.
 */
function AudienceTableContextDemo() {
  const ctx = useAudienceTableContext();
  return (
    <div className='text-app text-secondary-token'>
      <p>selected: {ctx.selectedIds.size}</p>
      <p>open menu row: {ctx.openMenuRowId ?? 'none'}</p>
      <p>
        hidden columns:{' '}
        {Object.entries(ctx.hiddenMetadataColumns)
          .filter(([, hidden]) => hidden)
          .map(([key]) => key)
          .join(', ') || 'none'}
      </p>
    </div>
  );
}

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/AudienceTableContext',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AudienceTableContextDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AudienceTableStableProvider
      value={{
        toggleSelect: () => {},
        setOpenMenuRowId: () => {},
        getContextMenuItems: () => [],
        onExportMember: () => {},
        onBlockMember: () => {},
        onViewProfile: () => {},
        onSendNotification: () => {},
        getTouringCity: () => null,
        hiddenMetadataColumns: {
          location: false,
          source: false,
          engagement: false,
          lastSeen: false,
        },
      }}
    >
      <AudienceTableVolatileProvider
        value={{ selectedIds: new Set(['member-1']), openMenuRowId: null }}
      >
        <AudienceTableContextDemo />
      </AudienceTableVolatileProvider>
    </AudienceTableStableProvider>
  ),
};
