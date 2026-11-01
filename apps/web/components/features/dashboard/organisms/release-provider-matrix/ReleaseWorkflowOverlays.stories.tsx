import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseWorkflowOverlays } from './ReleaseWorkflowOverlays';

const meta = {
  title: 'Dashboard/Releases/ReleaseWorkflowOverlays',
  component: ReleaseWorkflowOverlays,
  args: {
    amPaletteOpen: false,
    setAmPaletteOpen: fn(),
    spotifySearchOpen: true,
    setSpotifySearchOpen: fn(),
    onAppleMusicConnect: fn(),
    onSpotifyConnected: fn(),
    onSpotifyImportStart: fn(),
    postCreateRelease: null,
    isPostCreatePlanModalOpen: false,
    isReleasePlanGateLoading: false,
    canGenerateReleasePlans: false,
    isGeneratingReleasePlan: false,
    closePostCreatePlanModal: fn(),
    onGenerateReleasePlan: fn(),
    deleteTarget: null,
    isDeleting: false,
    closeDeleteDialog: fn(),
    onDeleteConfirm: fn(),
  },
} satisfies Meta<typeof ReleaseWorkflowOverlays>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  args: { spotifyConnected: true, spotifyArtistName: 'Tim White' },
};

export const Disconnected: Story = {
  args: { spotifyConnected: false },
};
