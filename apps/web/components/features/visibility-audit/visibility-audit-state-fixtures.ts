import { assembleVisibilityAudit } from '@/lib/visibility-audit/assemble';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';
import type { VisibilityAuditReport } from '@/lib/visibility-audit/types';

/** State fixtures shared by the report view's state stories and tests. */
export const SAMPLE_VISIBILITY_AUDIT_REPORT = assembleVisibilityAudit(
  TIM_WHITE_VISIBILITY_AUDIT_INPUT
);

const report = SAMPLE_VISIBILITY_AUDIT_REPORT;

/** A report for a profile with no stored evidence in any section. */
export const EMPTY_VISIBILITY_AUDIT_REPORT: VisibilityAuditReport = {
  ...report,
  evidenceNote: null,
  identity: { ...report.identity, steps: [] },
  dspPresence: {
    ...report.dspPresence,
    presentCount: 0,
    missingCount: 0,
    platforms: [],
  },
  linkGraph: { nodes: [], conflicts: [] },
  citations: { ...report.citations, questions: [] },
  catalog: { ...report.catalog, mismatches: [] },
  pixels: { rows: [] },
  fixes: [],
};

const LONG_REASON =
  'The streaming profile, the label copy and the link-in-bio page each describe the artist differently, so search engines and answer engines cannot tell which one is canonical. Align the bio, the handle and the outbound links on every surface, then resubmit each profile so the stored copy matches the live one.';

/** A report whose names, conflicts and fixes run long. */
export const LONG_VISIBILITY_AUDIT_REPORT: VisibilityAuditReport = {
  ...report,
  artistName: 'Tim White and the Midnight Orchestra of Los Angeles',
  linkGraph: {
    ...report.linkGraph,
    conflicts: [
      {
        kind: 'outbound_disagrees_with_profile',
        summary: `Link-in-bio outbound link disagrees with the stored profile. ${LONG_REASON}`,
      },
    ],
  },
  fixes: [
    {
      priority: 1,
      title:
        'Align the artist bio, handle and outbound links across every streaming and social profile',
      reason: LONG_REASON,
      agenticFix: {
        kind: 'manual',
        action:
          'Update the bio on every profile, then request a fresh crawl from each service',
      },
    },
    ...report.fixes.map(fix => ({ ...fix, priority: fix.priority + 1 })),
  ],
};
