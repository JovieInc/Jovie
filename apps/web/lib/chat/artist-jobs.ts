/**
 * What an artist clicks each object for, and what must travel with the click.
 *
 * One short list per object (release, channel, profile, fan): the few jobs an
 * artist opens that object to get done, the one-click action that does it, and
 * what chat must already know when the action opens chat. Two guards read it:
 *
 * - `tests/unit/chat/artist-jobs.test.ts` checks every named action still
 *   exists in its registry, so a renamed or removed action fails CI.
 * - The nightly action walk (golden-path-walk `flow-actions.mjs`, JOV-12633) clicks each
 *   `opensChat` job on the seeded demo artist and fails a first reply that
 *   asks for anything in `screenAlreadyHad`, or promises what chat can't do.
 *
 * Sources: Tim's screenshots of jov.ie/app/chat and the desktop app (Nov 14,
 * 2026: Re-check on a YouTube row asked him for the URL; Ask Jovie on a Work
 * item dropped the release), the Nov 14 audit of every chat opener, and the
 * action registries named below. `status` is what the code does today; update
 * it in the same PR that changes the behavior.
 */

export type ArtistObject = 'release' | 'channel' | 'profile' | 'fan';

/** What has to arrive in chat with the click. */
export type JobCarries =
  /** An `@kind:id[label]` entity token the server resolves. */
  | 'entity'
  /** The channel's public link, written out in the ask. */
  | 'url'
  /** Nothing: the job doesn't open chat. */
  | 'none';

export type JobStatus =
  /** One click does the job and chat knows the item. */
  | 'works'
  /** The action exists but drops or garbles the item (JOV-12423). */
  | 'drops-context'
  /** No one-click action yet. */
  | 'missing';

export interface ArtistJob {
  readonly id: string;
  readonly object: ArtistObject;
  /** The job in the artist's own words. */
  readonly job: string;
  /** Where the artist clicks. */
  readonly where: string;
  /** The action that does it: source file (from apps/web) and action id. */
  readonly action: { readonly file: string; readonly id: string } | null;
  readonly opensChat: boolean;
  readonly carries: JobCarries;
  /** Things the first reply must never ask for, because the screen had them. */
  readonly screenAlreadyHad: readonly string[];
  readonly status: JobStatus;
  /** Tracking issue when status is not `works`. */
  readonly issue?: string;
}

const RELEASE_ACTIONS =
  'components/features/dashboard/organisms/releases/release-actions.tsx';
const LIBRARY_ACTIONS = 'app/app/(shell)/library/library-entity-actions.ts';
const TASK_ACTIONS =
  'components/features/dashboard/tasks/task-action-registry.tsx';
const CONNECTION_ACTIONS = 'app/app/(shell)/profiles/connection-actions.tsx';

const RELEASE_FACTS = ['which release', 'release title', 'release link'];
const CHANNEL_FACTS = ['which platform', 'channel link', 'profile URL'];

export const ARTIST_JOBS: readonly ArtistJob[] = [
  {
    id: 'release.pitch',
    object: 'release',
    job: 'Pitch this release to playlists and press',
    where: 'Releases row menu > Generate Pitch',
    action: { file: RELEASE_ACTIONS, id: 'generate-pitch' },
    opensChat: true,
    carries: 'entity',
    screenAlreadyHad: RELEASE_FACTS,
    status: 'works',
  },
  {
    id: 'release.albumArt',
    object: 'release',
    job: 'Make album art for this release',
    where: 'Releases row menu > Generate Album Art',
    action: { file: RELEASE_ACTIONS, id: 'generate-album-art' },
    opensChat: true,
    carries: 'entity',
    screenAlreadyHad: RELEASE_FACTS,
    status: 'drops-context',
    issue: 'JOV-12423',
  },
  {
    id: 'release.ask',
    object: 'release',
    job: 'Ask Jovie what to do next with this release',
    where: 'Work item menu > Ask Jovie',
    action: { file: LIBRARY_ACTIONS, id: 'ask-jovie' },
    opensChat: true,
    carries: 'entity',
    screenAlreadyHad: RELEASE_FACTS,
    status: 'works',
  },
  {
    id: 'release.taskPitch',
    object: 'release',
    job: 'Finish the pitch task for a release',
    where: 'Tasks row menu > Generate Pitch',
    action: { file: TASK_ACTIONS, id: 'generate-pitch' },
    opensChat: true,
    carries: 'entity',
    screenAlreadyHad: RELEASE_FACTS,
    status: 'drops-context',
    issue: 'JOV-12423',
  },
  {
    id: 'release.share',
    object: 'release',
    job: 'Share the smart link',
    where: 'Releases row menu > Copy Smart Link',
    action: { file: RELEASE_ACTIONS, id: 'copy-smart-link' },
    opensChat: false,
    carries: 'none',
    screenAlreadyHad: [],
    status: 'works',
  },
  {
    id: 'channel.recheck',
    object: 'channel',
    job: 'Check this channel still matches my Jovie profile',
    where: 'Profiles row > Re-check',
    action: { file: CONNECTION_ACTIONS, id: 'connection-fix' },
    opensChat: true,
    carries: 'url',
    screenAlreadyHad: CHANNEL_FACTS,
    status: 'works',
  },
  {
    id: 'channel.ask',
    object: 'channel',
    job: 'Ask Jovie how to grow this channel',
    where: 'Profiles row menu > Ask Jovie',
    action: { file: CONNECTION_ACTIONS, id: 'ask-jovie' },
    opensChat: true,
    carries: 'url',
    screenAlreadyHad: CHANNEL_FACTS,
    status: 'works',
  },
  {
    id: 'channel.open',
    object: 'channel',
    job: 'Open the channel itself',
    where: 'Profiles row menu > Open',
    action: { file: CONNECTION_ACTIONS, id: 'open-connection' },
    opensChat: false,
    carries: 'none',
    screenAlreadyHad: [],
    status: 'works',
  },
  {
    id: 'profile.edit',
    object: 'profile',
    job: 'Fix my bio, photo or links',
    where: 'Profiles > Edit Profile',
    action: { file: CONNECTION_ACTIONS, id: 'edit-profile' },
    opensChat: false,
    carries: 'none',
    screenAlreadyHad: [],
    status: 'works',
  },
  {
    id: 'profile.review',
    object: 'profile',
    job: 'Get my profile ready to share',
    where: 'New chat > Review Your Profile',
    action: null,
    opensChat: true,
    carries: 'entity',
    screenAlreadyHad: ['my handle', 'my profile link'],
    status: 'works',
  },
  {
    id: 'fan.top',
    object: 'fan',
    job: 'See who my most engaged fans are',
    where: 'Audience',
    action: null,
    opensChat: false,
    carries: 'none',
    screenAlreadyHad: [],
    status: 'works',
  },
  {
    id: 'fan.ask',
    object: 'fan',
    job: 'Ask Jovie what to send this fan or segment',
    where: 'Audience row (no action yet)',
    action: null,
    opensChat: true,
    carries: 'entity',
    screenAlreadyHad: ['which fan', 'fan name'],
    status: 'missing',
  },
];

export function jobsFor(object: ArtistObject): readonly ArtistJob[] {
  return ARTIST_JOBS.filter(job => job.object === object);
}
