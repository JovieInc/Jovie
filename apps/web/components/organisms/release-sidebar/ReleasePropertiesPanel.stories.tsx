import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleasePropertiesPanel } from './ReleasePropertiesPanel';
import type { Release } from './types';

const mockRelease = {
  id: 'rel_1',
  title: 'Midnight Drive',
  releaseType: 'single',
  releaseDate: '2026-11-14',
  totalTracks: 1,
  totalDurationMs: 214000,
  isExplicit: false,
  upc: '888880123456',
  primaryIsrc: 'USRC17607839',
  label: 'Independent',
  distributor: 'DistroKid',
  genres: ['pop', 'electronic'],
  copyrightLine: '2026 Example Artist',
  spotifyPopularity: 42,
  canvasStatus: 'not_set',
} as unknown as Release;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleasePropertiesPanel',
  component: ReleasePropertiesPanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    release: mockRelease,
    isEditable: false,
  },
} satisfies Meta<typeof ReleasePropertiesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Editable: Story = {
  args: {
    isEditable: true,
    onSaveMetadata: fn(() => Promise.resolve()),
    onSavePrimaryIsrc: fn(() => Promise.resolve()),
  },
};

export const WithoutCredits: Story = {
  args: {
    showCredits: false,
  },
};
