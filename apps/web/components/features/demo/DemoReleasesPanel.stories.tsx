import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleasesPanel } from './DemoReleasesPanel';
import { DEMO_RELEASES } from './demo-fixtures';

const meta = {
  title: 'Features/Demo/DemoReleasesPanel',
  component: DemoReleasesPanel,
  decorators: [
    Story => (
      <div className='h-96 w-80'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['groups'],
    },
  },
} satisfies Meta<typeof DemoReleasesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    groups: [
      { status: 'live', releases: DEMO_RELEASES.slice(0, 2) },
      { status: 'draft', releases: DEMO_RELEASES.slice(2, 3) },
    ],
    selectedId: null,
    onSelect: () => {},
  },
};
