import type { PlaybookTemplate } from './types';

const AB_TEST_URL = 'https://support.google.com/youtube/answer/16391400';
const CHAPTERS_URL = 'https://support.google.com/youtube/answer/9884579';
const SHORTS_FROM_VIDEO_URL =
  'https://support.google.com/youtube/answer/12836917';

/**
 * Long-form YouTube video, anchored to the publish date. Steps summarize
 * YouTube Help guidance on packaging tests, chapters and Shorts cutdowns.
 * Checklist-only: no shipped Jovie workflow runs any of these steps yet.
 */
export const YOUTUBE_VIDEO_PLAYBOOK: PlaybookTemplate = {
  id: 'youtube-video',
  version: 1,
  name: 'YouTube Video',
  summary:
    'Pre-production, title and thumbnail tests, publish day, the first 48 hours, community and Shorts cutdowns.',
  targetDateLabel: 'Publish Date',
  projectNamePlaceholder: 'Video title',
  assistMode: 'checklist_only',
  anchor: 'date',
  sources: [
    {
      title: 'A/B test titles and thumbnails',
      author: 'YouTube Help',
      url: AB_TEST_URL,
    },
    { title: 'Video chapters', author: 'YouTube Help', url: CHAPTERS_URL },
    {
      title: 'Create YouTube Shorts from your videos',
      author: 'YouTube Help',
      url: SHORTS_FROM_VIDEO_URL,
    },
  ],
  steps: [
    {
      id: 'pick-idea',
      title: 'Pick the idea and the promise to the viewer',
      phase: 'Pre-Production',
      offsetDays: -21,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Write one sentence a viewer would click on. If the title and thumbnail cannot make that promise, change the idea before you film.',
    },
    {
      id: 'research-topic',
      title: 'Watch what already ranks for the topic',
      phase: 'Pre-Production',
      offsetDays: -18,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'Note what the top videos cover and what they miss. Your video should earn the click by doing the missing part better.',
    },
    {
      id: 'script',
      title: 'Write the script or outline',
      phase: 'Pre-Production',
      offsetDays: -14,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Deliver on the promise in the first 30 seconds. Retention in the opening decides how far the video travels.',
    },
    {
      id: 'film',
      title: 'Film',
      phase: 'Pre-Production',
      offsetDays: -10,
      owner: 'creator',
      priority: 'high',
    },
    {
      id: 'edit-and-chapters',
      title: 'Edit and add chapters',
      phase: 'Pre-Production',
      offsetDays: -7,
      owner: 'collaborator',
      priority: 'high',
      explainerText:
        'Chapters come from timestamps in the description. The first one starts at 0:00 and each needs at least 10 seconds.',
      learnMoreUrl: CHAPTERS_URL,
    },
    {
      id: 'thumbnail-options',
      title: 'Design three thumbnail options',
      phase: 'Packaging',
      offsetDays: -5,
      owner: 'collaborator',
      priority: 'high',
      explainerText:
        'Make the options look clearly different. Check each one at phone size: one focal point, few or no words.',
    },
    {
      id: 'title-options',
      title: 'Write three title options',
      phase: 'Packaging',
      offsetDays: -4,
      owner: 'creator',
      priority: 'high',
    },
    {
      id: 'set-up-ab-test',
      title: 'Set up the title and thumbnail test',
      phase: 'Packaging',
      offsetDays: -3,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'YouTube Studio can test up to three titles or thumbnails and keeps the one with the most watch time. Leave the packaging alone while the test runs.',
      learnMoreUrl: AB_TEST_URL,
    },
    {
      id: 'upload-and-schedule',
      title: 'Upload, write the description and schedule',
      phase: 'Packaging',
      offsetDays: -2,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Add the description, chapters, end screen and cards, then schedule it for when your audience is usually online.',
    },
    {
      id: 'publish-and-share',
      title: 'Publish and tell your audience',
      phase: 'Publish',
      offsetDays: 0,
      owner: 'creator',
      priority: 'urgent',
      explainerText:
        'Send it to your email list and post it where your fans already follow you. Early viewers who care help the video find more like them.',
    },
    {
      id: 'first-hour-comments',
      title: 'Pin a comment and reply in the first hour',
      phase: 'Publish',
      offsetDays: 0,
      owner: 'creator',
      priority: 'high',
    },
    {
      id: 'check-48h',
      title: 'Check click-through rate and retention at 48 hours',
      phase: 'First 48 Hours',
      offsetDays: 2,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Compare against your recent uploads. Low click-through points at packaging; an early drop in retention points at the opening.',
    },
    {
      id: 'adjust-packaging',
      title: 'Adjust the packaging if clicks lag',
      phase: 'First 48 Hours',
      offsetDays: 2,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'If no test is running and click-through is well below your usual, try a new thumbnail before changing the title.',
    },
    {
      id: 'community-post',
      title: 'Post behind the scenes in Community',
      phase: 'Community',
      offsetDays: 3,
      owner: 'creator',
      priority: 'low',
    },
    {
      id: 'reply-and-collect-ideas',
      title: 'Reply to comments and save ideas for the next video',
      phase: 'Community',
      offsetDays: 7,
      owner: 'creator',
      priority: 'medium',
    },
    {
      id: 'shorts-cutdowns',
      title: 'Cut two or three Shorts from the video',
      phase: 'Shorts',
      offsetDays: 3,
      owner: 'collaborator',
      priority: 'medium',
      explainerText:
        'Shorts made with Edit into a Short link back to the full video. It only works on public videos you uploaded yourself.',
      learnMoreUrl: SHORTS_FROM_VIDEO_URL,
    },
    {
      id: 'review-results',
      title: 'Review the test result and two-week numbers',
      phase: 'Shorts',
      offsetDays: 14,
      owner: 'creator',
      priority: 'low',
      explainerText:
        'Tests usually finish within two weeks. Write down what won so the next video starts from a better guess.',
    },
  ],
};
