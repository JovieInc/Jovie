import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { EntityRail } from './EntityRail';
import {
  type EntityRailEntityType,
  getEntityRailConfig,
} from './entityRailConfig';

const meta = {
  title: 'Molecules/Drawer/EntityRail',
  component: EntityRail,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof EntityRail>;

export default meta;
type Story = StoryObj<typeof meta>;

// Reuse one interaction fixture across all entity types; the configuration
// table supplies the type-specific tabs, stat labels, and measuring sources.
function railStory(entityType: EntityRailEntityType): Story {
  const { label } = getEntityRailConfig(entityType);
  const title =
    entityType === 'release'
      ? 'Lost in the Light'
      : `Example ${label.toLowerCase()}`;
  return {
    args: {
      entityType,
      isOpen: true,
      eyebrow: label,
      title,
      subtitle: 'EntityRail interaction fixture',
      onClose: fn(),
      overviewProperties: [
        { label: 'Type', value: label },
        { label: 'Name', value: title, copyValue: title },
        { label: 'Status', value: 'Active' },
      ],
      activityItems: ['edited', 'linked', 'approved'].map((verb, index) => ({
        id: `${entityType}-${index}`,
        actor: 'Tim White',
        verb,
        object: title,
        at: `2026-01-${15 - index}T10:00:00Z`,
      })),
    },
  };
}

export const Release: Story = railStory('release');
export const Track: Story = railStory('track');
export const Work: Story = railStory('work');
export const Contact: Story = railStory('contact');
export const Fan: Story = railStory('fan');
export const ArtistProfile: Story = railStory('artist-profile');
export const Link: Story = railStory('link');
export const TourDate: Story = railStory('tour-date');
export const Task: Story = railStory('task');
export const DspMatch: Story = railStory('dsp-match');
export const PullRequest: Story = railStory('pull-request');
export const Agent: Story = railStory('agent');
export const Certification: Story = railStory('certification');
export const CostLine: Story = railStory('cost-line');
