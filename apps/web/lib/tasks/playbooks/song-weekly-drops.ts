import { recordResultsStep } from './record-results';
import type { PlaybookChannel, PlaybookStep, PlaybookTemplate } from './types';

interface WeeklyDrop {
  readonly id: string;
  readonly title: string;
  readonly channel: PlaybookChannel;
  readonly explainerText?: string;
}

/**
 * One song, a new reason to show up every Friday for 17 weeks. Week 0 is the
 * single; week 16 hands off to the next song's single, so three songs fill a
 * year of Fridays. Versions mirror the release child types Jovie already
 * models (sped up, acoustic, instrumental, remix).
 */
const WEEKLY_DROPS: readonly WeeklyDrop[] = [
  {
    id: 'single',
    title: 'Release the single',
    channel: 'platform',
    explainerText:
      'Run the Music Release plan on the release itself. Its smart link, profile feature and fan alert carry every later drop.',
  },
  { id: 'lyric-video', title: 'Drop the lyric video', channel: 'long_video' },
  {
    id: 'story-short',
    title: 'Post the story behind the song',
    channel: 'short_video',
    explainerText:
      'Use your intake answers. Fans share the story before they share the song.',
  },
  {
    id: 'acoustic',
    title: 'Release the acoustic version',
    channel: 'platform',
  },
  {
    id: 'music-video',
    title: 'Premiere the music video',
    channel: 'long_video',
  },
  {
    id: 'live-clip',
    title: 'Post a live performance clip',
    channel: 'short_video',
  },
  {
    id: 'visualizer',
    title: 'Share a visualizer or loop for short-form video',
    channel: 'short_video',
  },
  {
    id: 'studio-doc',
    title: 'Publish an interview or studio doc',
    channel: 'long_video',
  },
  { id: 'sped-up', title: 'Release the sped-up version', channel: 'platform' },
  {
    id: 'instrumental',
    title: 'Release the instrumental',
    channel: 'platform',
  },
  { id: 'remix', title: 'Release a remix', channel: 'platform' },
  {
    id: 'fan-challenge',
    title: 'Start a cover or duet challenge',
    channel: 'community',
    explainerText:
      'Repost the best fan versions every day this week. It is the cheapest reach you will get.',
  },
  {
    id: 'show-announcement',
    title: 'Announce a show or tour date',
    channel: 'email',
  },
  {
    id: 'live-recording',
    title: 'Release a live recording',
    channel: 'platform',
  },
  {
    id: 'collab-remix',
    title: 'Release a collaboration or feature version',
    channel: 'partner',
  },
  {
    id: 'next-teaser',
    title: 'Tease the next single',
    channel: 'social',
  },
  {
    id: 'next-single',
    title: 'Release the next single and start its sequence',
    channel: 'platform',
  },
];

const DAYS_PER_WEEK = 7;

function weeklyDropStep(drop: WeeklyDrop, week: number): PlaybookStep {
  return {
    id: drop.id,
    title: drop.title,
    phase: week === 0 ? 'Release Week' : `Week ${week}`,
    offsetDays: week * DAYS_PER_WEEK,
    owner: 'creator',
    priority: week === 0 ? 'urgent' : 'high',
    explainerText: drop.explainerText,
    channel: drop.channel,
  };
}

export const SONG_WEEKLY_DROPS_PLAYBOOK: PlaybookTemplate = {
  id: 'song-weekly-drops',
  version: 1,
  name: 'Song: 17 Weekly Drops',
  summary:
    'Turn one song into something new every Friday for 17 weeks: versions, videos, stories, a show and the next single.',
  targetDateLabel: 'Single Release Date',
  projectNamePlaceholder: 'Song title',
  origin: 'jovie',
  assistMode: 'checklist_only',
  anchor: 'date',
  intake: {
    kind: 'story_interview',
    prompts: [
      'What is the song about, in the sentence you would say to a friend?',
      'What happened the day you wrote it?',
      'Which line do you expect fans to sing back?',
      'Who made it with you?',
      'What should someone do right after hearing it?',
    ],
  },
  defaultAutonomy: 'review',
  iterative: true,
  sources: [],
  steps: [
    {
      id: 'tell-the-story',
      title: 'Answer the song story questions',
      phase: 'Plan',
      offsetDays: -28,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Every drop borrows from this story. Plans built from release metadata alone fall flat with fans.',
    },
    {
      id: 'plan-the-calendar',
      title: 'Book the versions and videos for all 17 weeks',
      phase: 'Plan',
      offsetDays: -21,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Record the acoustic, instrumental and sped-up masters now so no Friday waits on a session.',
    },
    ...WEEKLY_DROPS.map(weeklyDropStep),
    recordResultsStep((WEEKLY_DROPS.length - 1) * DAYS_PER_WEEK, 'Week 16'),
  ],
};
