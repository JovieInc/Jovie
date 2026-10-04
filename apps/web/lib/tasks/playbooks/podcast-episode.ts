import { recordResultsStep } from './record-results';
import type { PlaybookTemplate } from './types';

const FEED_REQUIREMENTS_URL =
  'https://podcasters.apple.com/support/823-podcast-requirements';
const GUEST_PROMOTION_URL = 'https://castos.com/how-to-promote-a-podcast/';

/**
 * Interview episode, anchored to the publish date. Steps summarize podcast
 * directory feed requirements and common guest-promotion practice.
 * Checklist-only: no shipped Jovie workflow runs any of these steps yet.
 */
export const PODCAST_EPISODE_PLAYBOOK: PlaybookTemplate = {
  id: 'podcast-episode',
  version: 1,
  name: 'Podcast Episode',
  summary:
    'Guest prep, recording, the edit, show notes and clips, distribution and a share kit your guest will use.',
  targetDateLabel: 'Publish Date',
  projectNamePlaceholder: 'Episode title or guest name',
  origin: 'researched',
  assistMode: 'checklist_only',
  anchor: 'date',
  intake: { kind: 'none' },
  defaultAutonomy: 'review',
  iterative: true,
  sources: [
    {
      title: 'Podcast RSS feed requirements',
      author: 'Apple Podcasts for Creators',
      url: FEED_REQUIREMENTS_URL,
    },
    {
      title: 'How to promote a podcast episode',
      author: 'Castos',
      url: GUEST_PROMOTION_URL,
    },
  ],
  steps: [
    {
      id: 'book-guest',
      title: 'Book the guest and confirm date, time zone and format',
      phase: 'Guest Prep',
      offsetDays: -28,
      owner: 'creator',
      priority: 'high',
    },
    {
      id: 'research-guest',
      title: 'Research the guest and draft questions',
      phase: 'Guest Prep',
      offsetDays: -21,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Read or listen to their recent work. Ask what they have not been asked ten times already.',
    },
    {
      id: 'guest-prep-note',
      title: 'Send the guest a prep note',
      phase: 'Guest Prep',
      offsetDays: -16,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'Cover topics, anything off limits, the mic and room setup, and when the episode comes out. Ask for their handles and the link they want to promote.',
    },
    {
      id: 'record',
      title: 'Record the episode',
      phase: 'Record',
      offsetDays: -14,
      owner: 'guest',
      priority: 'urgent',
    },
    {
      id: 'log-moments',
      title: 'Back up the files and note the strongest moments',
      phase: 'Record',
      offsetDays: -13,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'Timestamps you jot down right after the call become your clips, chapters and episode title.',
    },
    {
      id: 'edit',
      title: 'Edit the audio and video',
      phase: 'Edit',
      offsetDays: -9,
      owner: 'collaborator',
      priority: 'high',
    },
    {
      id: 'episode-title',
      title: 'Write the episode title',
      phase: 'Edit',
      offsetDays: -7,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Lead with what the listener gets, then the guest name. The show name is already on screen.',
    },
    {
      id: 'show-notes',
      title: 'Write show notes',
      phase: 'Notes and Clips',
      offsetDays: -5,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Timestamps, every link mentioned, and a few lines on why this guest matters. Spell their name right everywhere.',
    },
    {
      id: 'cut-clips',
      title: 'Cut two or three captioned clips',
      phase: 'Notes and Clips',
      offsetDays: -4,
      owner: 'collaborator',
      priority: 'medium',
      explainerText:
        'Export vertical for short-form video and square for feeds. Captions matter: most people watch with the sound off.',
      channel: 'short_video',
    },
    {
      id: 'episode-artwork',
      title: 'Make episode artwork with the guest on it',
      phase: 'Notes and Clips',
      offsetDays: -3,
      owner: 'collaborator',
      priority: 'medium',
    },
    {
      id: 'upload-and-schedule',
      title: 'Upload to your host and check the feed details',
      phase: 'Distribution',
      offsetDays: -2,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Directories read the title, description, artwork and publish date from your feed. Fix them before release, not after.',
      learnMoreUrl: FEED_REQUIREMENTS_URL,
    },
    {
      id: 'publish',
      title: 'Publish and post the episode page',
      phase: 'Distribution',
      offsetDays: 0,
      owner: 'creator',
      priority: 'urgent',
      channel: 'platform',
    },
    {
      id: 'email-list',
      title: 'Send the episode to your email list',
      phase: 'Distribution',
      offsetDays: 0,
      owner: 'creator',
      priority: 'high',
      channel: 'email',
    },
    {
      id: 'guest-share-kit',
      title: 'Send the guest a share kit',
      phase: 'Guest Amplification',
      offsetDays: 0,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'The episode link, two clips, a quote card and a suggested post. The easier you make it, the more likely they share.',
      learnMoreUrl: GUEST_PROMOTION_URL,
      channel: 'partner',
    },
    {
      id: 'tag-guest',
      title: 'Tag the guest in every post',
      phase: 'Guest Amplification',
      offsetDays: 0,
      owner: 'creator',
      priority: 'medium',
      channel: 'social',
    },
    {
      id: 'second-clip',
      title: 'Post a second clip',
      phase: 'Guest Amplification',
      offsetDays: 2,
      owner: 'creator',
      priority: 'medium',
      channel: 'short_video',
    },
    {
      id: 'thank-guest',
      title: 'Thank the guest and share how the episode is doing',
      phase: 'Guest Amplification',
      offsetDays: 7,
      owner: 'creator',
      priority: 'low',
    },
    recordResultsStep(14, 'Guest Amplification'),
  ],
};
