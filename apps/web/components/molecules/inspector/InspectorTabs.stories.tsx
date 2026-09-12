import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InspectorTabs } from './InspectorTabs';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

const meta = {
  title: 'Molecules/Inspector/InspectorTabs',
  component: InspectorTabs,
  parameters: {
    layout: 'centered',
  },
  args: {
    value: 'details' as const,
    onValueChange: () => undefined,
    options: LIBRARY_INSPECTOR_TABS,
    ariaLabel: 'Inspector tabs',
    panelId: 'inspector-tab-panel',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InspectorTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
