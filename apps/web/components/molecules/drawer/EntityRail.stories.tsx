import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { EntityRail, type EntityRailProperty } from './EntityRail';
import type {
  EntityRailActivityItem,
  EntityRailEntityType,
} from './entityRailConfig';

/**
 * One story per entity type in the entity table — Storybook parity for the
 * ONE right-rail template. Fixtures reuse the right-rail-shotgun mock entity
 * set (the release is the shotgun's "Lost in the Light"); every rail renders
 * the same template so the comparison evaluates the entity type alone.
 */

const meta = {
  title: 'Molecules/Drawer/EntityRail',
  component: EntityRail,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof EntityRail>;

export default meta;
type Story = StoryObj<typeof meta>;

interface RailFixture {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly properties: readonly EntityRailProperty[];
  readonly activity: readonly EntityRailActivityItem[];
}

const activity = (
  entries: readonly [string, string, string][]
): readonly EntityRailActivityItem[] =>
  entries.map(([actor, verb, object], index) => ({
    id: `${actor}-${verb}-${index}`,
    actor,
    verb,
    object,
    at: `2026-01-${String(10 + index).padStart(2, '0')}T10:0${index}:00Z`,
  }));

const FIXTURES: Record<EntityRailEntityType, RailFixture> = {
  release: {
    eyebrow: 'Release',
    title: 'Lost in the Light',
    subtitle: 'Bahamas · Single',
    properties: [
      { label: 'Status', value: 'Live' },
      { label: 'ISRC', value: 'USRC17607839', copyValue: 'USRC17607839' },
      { label: 'Release date', value: 'Apr 12, 2026' },
    ],
    activity: activity([
      ['Tim White', 'edited', 'Lost in the Light'],
      ['Jovie', 'linked', 'Spotify'],
      ['Maya Vale', 'approved', 'Tour poster'],
    ]),
  },
  track: {
    title: 'Lost in the Light',
    subtitle: 'Track 1 · 3:33',
    properties: [
      { label: 'ISRC', value: 'USRC17607839', copyValue: 'USRC17607839' },
      { label: 'Key', value: 'A min' },
      { label: 'BPM', value: '96' },
    ],
    activity: activity([['Jovie', 'analyzed', 'audio fingerprint']]),
  },
  work: {
    title: 'Press photos 2026',
    subtitle: 'Work · 12 files',
    properties: [
      { label: 'Files', value: '12' },
      { label: 'Size', value: '48 MB' },
      { label: 'Last edited', value: 'Jan 15' },
    ],
    activity: activity([['Tim White', 'uploaded', 'press-photo-04.jpg']]),
  },
  contact: {
    title: 'Maya Vale',
    subtitle: 'Brand partnerships · Worldwide',
    properties: [
      {
        label: 'Email',
        value: 'maya@example.com',
        copyValue: 'maya@example.com',
      },
      { label: 'Last contact', value: '3 days ago' },
      { label: 'Open tasks', value: '2' },
    ],
    activity: activity([['Tim White', 'emailed', 'Maya Vale']]),
  },
  fan: {
    title: 'Alex Rivera',
    subtitle: 'Fan · Los Angeles',
    properties: [
      { label: 'Visits', value: '8' },
      { label: 'Link clicks', value: '21' },
      { label: 'Last seen', value: '2h ago' },
    ],
    activity: activity([['Alex Rivera', 'clicked', 'smart link']]),
  },
  'artist-profile': {
    title: 'Bahamas',
    subtitle: 'Artist profile · jov.ie/bahamas',
    properties: [
      { label: 'Handle', value: 'bahamas', copyValue: 'bahamas' },
      { label: 'Profile views', value: '1,204' },
      { label: 'Subscribers', value: '184' },
    ],
    activity: activity([['Jovie', 'published', 'profile']]),
  },
  link: {
    title: 'Lost in the Light — smart link',
    subtitle: 'jov.ie/r/lost-in-the-light',
    properties: [
      { label: 'Clicks', value: '1,204' },
      { label: 'Last click', value: '2h ago' },
      { label: 'Top source', value: 'Instagram' },
    ],
    activity: activity([['Jovie', 'created', 'smart link']]),
  },
  'tour-date': {
    title: 'Club Night',
    subtitle: 'Los Angeles · Jun 12',
    properties: [
      { label: 'Tickets clicks', value: '312' },
      { label: 'Views', value: '1,890' },
      { label: 'Days to show', value: '42' },
    ],
    activity: activity([['Tim White', 'confirmed', 'venue']]),
  },
  task: {
    title: 'Submit canvas video',
    subtitle: 'Task · Release: Lost in the Light',
    properties: [
      { label: 'Status age', value: '4 days' },
      { label: 'Owner', value: 'Tim White' },
      { label: 'Due', value: 'Jan 20' },
    ],
    activity: activity([['Jovie', 'created', 'task']]),
  },
  'dsp-match': {
    title: 'Spotify for Artists',
    subtitle: 'DSP match · Bahamas',
    properties: [
      { label: 'Confidence', value: 'High' },
      { label: 'Status', value: 'Connected' },
      { label: 'Last checked', value: 'Jan 14' },
    ],
    activity: activity([['Jovie', 'verified', 'DSP match']]),
  },
  'pull-request': {
    title: 'feat(ui): stable hover-reveal controls',
    subtitle: 'Pull request · #22995',
    properties: [
      { label: 'Stage age', value: '6h' },
      { label: 'Checks', value: '28 passing' },
      { label: 'Queue position', value: '3' },
    ],
    activity: activity([['Cursor', 'pushed', 'commit 2471775']]),
  },
  agent: {
    title: 'GLM 5.3 Developer',
    subtitle: 'Agent · Jovie mesh',
    properties: [
      { label: 'Runs 24h', value: '14' },
      { label: 'Success rate', value: '93%' },
      { label: 'Last heartbeat', value: '1m ago' },
    ],
    activity: activity([['GLM 5.3 Developer', 'merged', 'PR #22971']]),
  },
  certification: {
    title: 'EntityRail certification',
    subtitle: 'Certification · ds-cert:entity-rail-core',
    properties: [
      { label: 'Blockers', value: '0' },
      { label: 'Review state', value: 'In review' },
      { label: 'Age', value: '2 days' },
    ],
    activity: activity([['Remediator', 'repaired', 'CI lane']]),
  },
  'cost-line': {
    title: 'CI minutes',
    subtitle: 'Cost line · GitHub Actions',
    properties: [
      { label: 'Spend 30d', value: '$412' },
      { label: 'Runway', value: '11 months' },
      { label: 'Cap used', value: '38%' },
    ],
    activity: activity([['Ovie', 'recorded', 'monthly cost']]),
  },
};

function railStory(entityType: EntityRailEntityType): Story {
  const fixture = FIXTURES[entityType];
  return {
    args: {
      entityType,
      isOpen: true,
      eyebrow: fixture.eyebrow,
      title: fixture.title,
      subtitle: fixture.subtitle,
      onClose: fn(),
      overviewProperties: fixture.properties,
      activityItems: fixture.activity,
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
