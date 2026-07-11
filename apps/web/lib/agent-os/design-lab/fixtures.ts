import type { DesignProposal } from './types';

const FIXTURE_CREATED_AT = '2026-06-08T12:00:00.000Z';

export const DESIGN_LAB_DEV_FIXTURE_PROPOSALS: readonly DesignProposal[] = [
  {
    id: 'profile-page-quiet-hero',
    kind: 'surface',
    surfaceId: 'profile-page',
    surfaceName: 'Public profile page',
    proposalText:
      'Replace the full-bleed hero gradient with a restrained surface-1 header band, left-aligned artist name, and a single accent underline on the active tab.',
    assetRefs: ['agentos/runs/design-lab/assets/profile-page-quiet-hero.png'],
    scoring: { weight: 0.9, score: 0.82 },
    linearIssueId: 'JOV-1951',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-1951/profile-redesign-proposal-loop',
    status: 'proposed',
    designGap: null,
    createdAt: FIXTURE_CREATED_AT,
    reviewedAt: null,
    reviewer: null,
    reviewNotes: null,
    reviewDecision: null,
    dispatchId: null,
    dayBucket: '2026-06-08',
  },
  {
    id: 'sidebar-density-pass',
    kind: 'surface',
    surfaceId: 'dashboard-sidebar',
    surfaceName: 'Dashboard sidebar',
    proposalText:
      'Tighten sidebar row height by 2px, reduce icon stroke to 2.0, and move section labels to 11px tertiary copy with no uppercase tracking.',
    assetRefs: [],
    scoring: { weight: 0.7, score: 0.74 },
    linearIssueId: 'JOV-2098',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-2098/designadmin-consolidate-overlapping-ia-across-overview-ops-growth',
    status: 'proposed',
    designGap: null,
    createdAt: FIXTURE_CREATED_AT,
    reviewedAt: null,
    reviewer: null,
    reviewNotes: null,
    reviewDecision: null,
    dispatchId: null,
    dayBucket: '2026-06-08',
  },
];
