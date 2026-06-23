import type { TasteIssue } from '../linear';
import { type PostTasteSlackCardResult, postTasteSlackCard } from './post-card';

export interface TasteSlackNotifySummary {
  readonly posted: number;
  readonly skipped: number;
  readonly failed: number;
  readonly results: ReadonlyArray<{
    readonly issueId: string;
    readonly identifier: string;
    readonly result: PostTasteSlackCardResult;
  }>;
}

export async function notifyTasteSlackCardsForIssues(
  issues: readonly TasteIssue[],
  storePath?: string
): Promise<TasteSlackNotifySummary> {
  const results: TasteSlackNotifySummary['results'][number][] = [];
  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (const issue of issues) {
    const result = await postTasteSlackCard(issue, storePath);
    results.push({
      issueId: issue.id,
      identifier: issue.identifier,
      result,
    });

    if (result.posted) {
      posted += 1;
    } else if (result.skipped) {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return { posted, skipped, failed, results };
}
