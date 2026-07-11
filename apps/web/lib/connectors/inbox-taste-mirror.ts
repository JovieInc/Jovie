/**
 * Aggregate inbox decisions into taste-preference pages for gbrain (JOV-3934).
 *
 * Pure builders + a job entrypoint. The nightly/async runner (or tests) call
 * `buildTastePreferencePages` then `formatTastePreferencePage` for each kind.
 * Network writes to gbrain stay outside the web request path.
 */

export interface InboxDecisionAggregate {
  readonly cardKind: string;
  readonly approved: number;
  readonly rejected: number;
  readonly reasons: readonly string[];
}

export interface TastePreferencePage {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly approved: number;
  readonly rejected: number;
  readonly netScore: number;
}

/** Prefer approved kinds; netScore = approved - rejected. */
export function buildTastePreferencePages(
  aggregates: readonly InboxDecisionAggregate[]
): readonly TastePreferencePage[] {
  return aggregates
    .filter(row => row.approved + row.rejected > 0)
    .map(row => {
      const netScore = row.approved - row.rejected;
      const slug = `taste/inbox/${slugifyKind(row.cardKind)}`;
      const title = `Inbox taste: ${row.cardKind}`;
      const reasonLine =
        row.reasons.length > 0
          ? `\nCommon reject reasons: ${row.reasons.slice(0, 5).join('; ')}`
          : '';
      const body = [
        `# ${title}`,
        '',
        `- approved: ${row.approved}`,
        `- rejected: ${row.rejected}`,
        `- net: ${netScore}`,
        reasonLine,
        '',
        'Source: opportunity-inbox-decision feedback events.',
      ]
        .filter(Boolean)
        .join('\n');

      return {
        slug,
        title,
        body,
        approved: row.approved,
        rejected: row.rejected,
        netScore,
      };
    })
    .sort((a, b) => b.netScore - a.netScore);
}

export function formatTastePreferencePage(page: TastePreferencePage): string {
  return page.body;
}

/**
 * Reduce raw decision rows (from feedback context) into per-kind aggregates.
 * Idempotent: counting is pure; callers pass the full window each run.
 */
export function aggregateInboxDecisions(
  rows: readonly {
    readonly verdict: 'approved' | 'rejected';
    readonly cardKind?: string | null;
    readonly reason?: string | null;
  }[]
): readonly InboxDecisionAggregate[] {
  const byKind = new Map<
    string,
    { approved: number; rejected: number; reasons: string[] }
  >();

  for (const row of rows) {
    const kind = (row.cardKind?.trim() || 'unknown').toLowerCase();
    const current = byKind.get(kind) ?? {
      approved: 0,
      rejected: 0,
      reasons: [],
    };
    if (row.verdict === 'approved') {
      current.approved += 1;
    } else {
      current.rejected += 1;
      const reason = row.reason?.trim();
      if (reason) current.reasons.push(reason);
    }
    byKind.set(kind, current);
  }

  return [...byKind.entries()].map(([cardKind, stats]) => ({
    cardKind,
    approved: stats.approved,
    rejected: stats.rejected,
    reasons: stats.reasons,
  }));
}

function slugifyKind(kind: string): string {
  return kind
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 64);
}
