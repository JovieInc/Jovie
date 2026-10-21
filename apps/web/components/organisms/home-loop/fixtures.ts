import type {
  HomeLoopAsk,
  HomeLoopCopy,
  HomeLoopDoneItem,
  HomeLoopRow,
  HomeLoopTile,
} from '@/lib/home-loop/contract';

/** Story and test fixtures; values mirror a real Ovie company-loop read. */
export const HOME_LOOP_FIXTURE_STAGES = [
  'investigating',
  'building',
  'tested',
  'merging',
  'deployed',
  'verified',
] as const;

export const HOME_LOOP_FIXTURE_COPY: HomeLoopCopy = {
  constraintClear: 'Nothing is blocking shipping',
  asksTitle: 'Blocked On You',
  asksEmpty: 'Nothing needs your decision.',
  asksError: 'Decisions could not load.',
  inFlightTitle: 'In Flight',
  inFlightEmpty: 'No work in flight.',
  inFlightError: 'Shipping data could not load.',
  doneTitle: 'Done Today',
  doneEmpty: 'Nothing has landed yet today.',
};

function tile(
  key: string,
  label: string,
  value: string,
  was: string | null,
  tone: HomeLoopTile['tone']
): HomeLoopTile {
  return { key, label, value, was, tone, measured: true };
}

export const HOME_LOOP_FIXTURE_PULSE: readonly HomeLoopTile[] = [
  tile('prod', 'Prod', 'c9b767a', '060037d', 'good'),
  tile('merges-today', 'Merges Today', '12', '7', 'good'),
  tile('merges-7d', 'Merges 7 Days', '84', '61', 'good'),
  tile('lanes', 'Lanes', '3/3', '0/1', 'good'),
  tile('queue', 'Queue', '4', null, 'neutral'),
  tile('held', 'Held', '2', '0', 'bad'),
  tile('gem-disk', 'Gem Disk Free', '18%', '10%', 'good'),
];

export const HOME_LOOP_FIXTURE_UNMEASURED_PULSE: readonly HomeLoopTile[] =
  HOME_LOOP_FIXTURE_PULSE.map(tile => ({
    ...tile,
    value: 'Not measured',
    was: null,
    tone: 'neutral',
    measured: false,
  }));

export const HOME_LOOP_FIXTURE_ASKS: readonly HomeLoopAsk[] = [
  {
    id: 'vercel-concurrency',
    title: 'Vercel on-demand concurrency for Jovie',
    recommendation: 'About $6 a month, at most $44. Recommended.',
    why: 'Gives production and staging builds their own lane so preview floods cannot stall production again.',
    decidable: true,
    canReply: true,
    evidence: ['https://vercel.com/docs/builds/managing-builds'],
    decisionDefault: {
      decision: 'approve',
      summary: 'Enable it for project jovie only',
      deadline: '2026-10-22T12:00:00.000Z',
      declared: true,
    },
    canFeedback: true,
  },
  {
    id: 'lyb-review',
    title: 'Submit LYB 1.2.0 to App Review',
    recommendation: 'Device checks, then approve the submission.',
    why: 'The build passes every App Store Connect readiness check but has never been submitted.',
    decidable: true,
    canReply: false,
    evidence: [],
    decisionDefault: null,
    canFeedback: false,
  },
];

function row(
  id: number,
  title: string,
  stageIndex: number,
  attention: HomeLoopRow['attention'] = null
): HomeLoopRow {
  return {
    id: `linear:JOV-${id}`,
    identifier: `JOV-${id}`,
    title,
    url: null,
    stage: HOME_LOOP_FIXTURE_STAGES[stageIndex] ?? 'investigating',
    stageIndex,
    complete: false,
    attention,
    updatedAt: '2026-10-20T18:00:00.000Z',
  };
}

export const HOME_LOOP_FIXTURE_ROWS: readonly HomeLoopRow[] = [
  row(8711, 'Sign-in OTP failure', 0, 'blocked'),
  row(8655, 'Merge-queue admission', 1, 'failing'),
  row(8650, 'Prod promotion gate', 3),
  row(8640, 'Summer and Instinct enablement', 4),
  row(8622, 'Unified API client and guardrails', 2),
  row(8601, 'Ovie: one composer and a living UI', 1),
];

export const HOME_LOOP_FIXTURE_DONE: readonly HomeLoopDoneItem[] = [
  { id: 'd1', label: 'Codex Quota Bug · #22299', url: null, verified: true },
  { id: 'd2', label: 'Lane Cleanup Leaks · #22301', url: null, verified: true },
  { id: 'd3', label: 'Source Validation · #22307', url: null, verified: false },
];
