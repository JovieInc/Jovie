import { branchSlug, controllerRepoRoot } from './git-github';
import { writePromptArtifact } from './ledger';
import {
  MAX_CONSECUTIVE_CI_FAILURES,
  MAX_CONSECUTIVE_UNFIXABLE_ISSUES,
  MAX_OVERNIGHT_MERGED_FIXES,
} from './manifest';
import type { OvernightIssue, OvernightRunState } from './types';
import { buildStandardVerificationSteps, runCommand } from './verify';

export function buildFixBranchName(issue: OvernightIssue, index: number) {
  const suffix = branchSlug(
    `${issue.surface}-${issue.path ?? issue.suiteId}-${issue.signature}`
  ).slice(0, 28);
  return `itstimwhite/overnight-qa-${String(index).padStart(3, '0')}-${suffix}`;
}

export function selectQueuedIssues(
  queue: readonly OvernightIssue[],
  state: OvernightRunState
) {
  return queue.filter(issue => {
    const historyEntry = state.issueHistory[issue.key];
    return (
      historyEntry?.status !== 'merged' && historyEntry?.status !== 'parked'
    );
  });
}

export function determineStopReason(state: OvernightRunState) {
  if (state.mergedFixCount >= MAX_OVERNIGHT_MERGED_FIXES) {
    return `Merged fix cap of ${MAX_OVERNIGHT_MERGED_FIXES} reached.`;
  }

  if (state.consecutiveCiFailures >= MAX_CONSECUTIVE_CI_FAILURES) {
    return `Hit ${MAX_CONSECUTIVE_CI_FAILURES} consecutive CI or deploy failures.`;
  }

  if (state.consecutiveUnfixableIssues >= MAX_CONSECUTIVE_UNFIXABLE_ISSUES) {
    return `Hit ${MAX_CONSECUTIVE_UNFIXABLE_ISSUES} consecutive unfixable issues.`;
  }

  return null;
}

function buildFixPrompt(issue: OvernightIssue, runDir: string) {
  const evidence = issue.evidencePaths.map(path => `- ${path}`).join('\n');
  const verification = buildStandardVerificationSteps(issue, [])
    .map(step => `- ${step.label}: \`${step.command.join(' ')}\``)
    .join('\n');

  return [
    'You are fixing one overnight QA issue in the Jovie repo.',
    '',
    `Issue key: ${issue.key}`,
    `Suite: ${issue.suiteId}`,
    `Surface: ${issue.surface}`,
    `Path: ${issue.path ?? 'n/a'}`,
    `Summary: ${issue.summary}`,
    '',
    'Constraints:',
    '- Investigate the root cause before editing.',
    '- Apply the smallest fix that resolves the issue.',
    '- Search for sibling instances of the same bug pattern and fix them only if they are the same defect.',
    '- Add a regression test when feasible.',
    '- Do not run /ship or /land-and-deploy from inside Codex.',
    '- Do not edit migration files or create middleware.ts.',
    '',
    'Evidence:',
    evidence || '- No local evidence files were recorded.',
    '',
    'Verification commands to keep green:',
    verification,
    '',
    `Run artifacts live under ${runDir}.`,
  ].join('\n');
}

export async function runCodexFix(issue: OvernightIssue, runDir: string) {
  const prompt = buildFixPrompt(issue, runDir);
  const promptFileName = `${issue.key.replaceAll('|', '_')}.md`;
  const promptPath = await writePromptArtifact(runDir, promptFileName, prompt);
  const result = runCommand(
    [
      'codex',
      'exec',
      `Read the issue brief at ${promptPath} and implement the fix in the current git branch.`,
      '-C',
      controllerRepoRoot(),
    ],
    { cwd: controllerRepoRoot() }
  );

  return { promptPath, result };
}
