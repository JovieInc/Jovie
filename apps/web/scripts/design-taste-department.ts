import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import process from 'node:process';
import { runDesignTasteDepartment } from '@/lib/agent-os/departments/design-taste';

const git = (c: string) => execSync(c, { encoding: 'utf8' });
async function main() {
  let runId = process.env.DESIGN_TASTE_DEPARTMENT_RUN_ID?.trim() ?? '';
  let baseRef =
    process.env.DESIGN_TASTE_DEPARTMENT_BASE_REF?.trim() || 'origin/main';
  let forceScheduled = false;
  const changedFiles: string[] = [];
  let pullRequestUrl =
    process.env.DESIGN_TASTE_DEPARTMENT_PR_URL?.trim() || null;
  let linearIssueId =
    process.env.DESIGN_TASTE_DEPARTMENT_LINEAR_ISSUE?.trim() || null;
  let diffFile: string | null = null;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--run-id=')) runId = a.slice(9);
    else if (a.startsWith('--base-ref=')) baseRef = a.slice(11);
    else if (a === '--trigger=scheduled-audit') forceScheduled = true;
    else if (a.startsWith('--changed-file=')) changedFiles.push(a.slice(15));
    else if (a.startsWith('--pull-request-url=')) pullRequestUrl = a.slice(19);
    else if (a.startsWith('--linear-issue=')) linearIssueId = a.slice(15);
    else if (a.startsWith('--diff-file=')) diffFile = a.slice(12);
  }
  if (!runId) throw new Error('Missing --run-id');
  const files =
    changedFiles.length > 0
      ? changedFiles
      : git(`git diff --name-only ${baseRef}...HEAD`)
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);
  let unifiedDiff: string | null = null;
  if (diffFile) unifiedDiff = await fs.readFile(diffFile, 'utf8');
  else if (!forceScheduled) {
    try {
      unifiedDiff = git(`git diff ${baseRef}...HEAD`);
    } catch {
      unifiedDiff = null;
    }
  }
  let gitSha: string | null = null;
  try {
    gitSha = git('git rev-parse HEAD').trim();
  } catch {
    gitSha = null;
  }
  const result = await runDesignTasteDepartment({
    runId,
    changedFiles: files,
    unifiedDiff,
    gitSha,
    pullRequestUrl,
    linearIssueId,
    forceScheduledAudit: forceScheduled,
  });
  console.log(
    JSON.stringify({
      ran: result.ran,
      skippedReason: result.skippedReason,
      trigger: result.trigger,
      findings: result.manifest?.findings.length ?? 0,
      kpis: result.manifest?.kpis ?? null,
      proposals: result.manifest?.proposals.map(p => p.kind) ?? [],
      manifestPath: result.manifestPath,
      artifactPath: result.artifactPath,
      prCommentPath: result.prCommentPath,
    })
  );
}
void main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
