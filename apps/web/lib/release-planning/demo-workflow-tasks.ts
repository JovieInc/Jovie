/**
 * Workflow task title map for the release-plan demo.
 *
 * Titles are copied verbatim from the default release task template
 * (`apps/web/lib/release-tasks/default-template.ts`) so the calendar drawer
 * shows real product copy instead of placeholder labels. Slugs are local to
 * the demo — the underlying catalog rows are referenced by title.
 */

export interface DemoWorkflowTask {
  readonly title: string;
  readonly category: string;
  readonly relativeDays: number;
}

export const DEMO_WORKFLOW_TASKS_BY_SLUG: Readonly<
  Record<string, DemoWorkflowTask>
> = Object.freeze({
  'upload-master': {
    title: 'Upload final master to distributor',
    category: 'Distribution',
    relativeDays: -30,
  },
  'enter-metadata': {
    title: 'Enter metadata (ISRC, UPC, credits, genres)',
    category: 'Distribution',
    relativeDays: -30,
  },
  'pitch-spotify': {
    title: 'Pitch to Spotify editorial (Spotify for Artists)',
    category: 'DSP Pitching',
    relativeDays: -28,
  },
  'pitch-apple': {
    title: 'Pitch to Apple Music editorial (via distributor)',
    category: 'DSP Pitching',
    relativeDays: -28,
  },
  'finalize-cover-artwork': {
    title: 'Finalize cover artwork (3000×3000)',
    category: 'Artwork',
    relativeDays: -21,
  },
  'draft-press-release': {
    title: 'Draft press release',
    category: 'Press',
    relativeDays: -21,
  },
  'update-spotify-bio': {
    title: 'Update Spotify artist bio & press photo',
    category: 'DSP Profile',
    relativeDays: -14,
  },
  'upload-canvas': {
    title: 'Upload Spotify Canvas video',
    category: 'DSP Profile',
    relativeDays: -7,
  },
  'create-smart-link': {
    title: 'Create Jovie smart link',
    category: 'Platform',
    relativeDays: -1,
  },
  'feature-on-profile': {
    title: 'Feature release on Jovie profile',
    category: 'Platform',
    relativeDays: -1,
  },
  'submit-genius': {
    title: 'Submit lyrics to Genius',
    category: 'Lyrics',
    relativeDays: 0,
  },
  'send-fan-notification': {
    title: 'Send fan notification',
    category: 'Fan Engagement',
    relativeDays: 0,
  },
  'review-analytics': {
    title: 'Review first-week analytics',
    category: 'Post-Release',
    relativeDays: 7,
  },
});

export type DemoWorkflowTaskSlug = keyof typeof DEMO_WORKFLOW_TASKS_BY_SLUG;
