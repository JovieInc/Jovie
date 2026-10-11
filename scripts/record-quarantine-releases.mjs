import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import writer from '../.github/scripts/update-quarantine.js';
import {
  addLinearIssueComment,
  listLinearIssueComments,
} from './lib/linear-issue-intake.mjs';

const REPO = 'JovieInc/Jovie';
const LEDGER = 'apps/web/tests/quarantine.json';
function fact(ok, message) {
  if (!ok) throw new Error(message);
}
/** Record only actual main ledger releases; proposals never trigger comments.
 * @param {object} input
 * @param {any[]} input.history
 * @param {() => void|Promise<void>} input.lease
 * @param {(plan:any)=>Promise<any>} [input.list]
 * @param {(plan:any)=>Promise<any>} [input.comment]
 */
export async function recordQuarantineReleases({
  history,
  lease,
  list = listLinearIssueComments,
  comment = addLinearIssueComment,
}) {
  fact(
    Array.isArray(history) &&
      history.length <= 1000 &&
      new Set(history.map(row => row.commit)).size === history.length,
    'Incomplete quarantine release history'
  );
  const plans = [];
  for (const row of history) {
    fact(
      /^[a-f0-9]{40}$/.test(row.commit),
      'Unbound quarantine release commit'
    );
    writer.validateLedger(row.before);
    writer.validateLedger(row.after);
    for (const entry of row.before.entries) {
      if (
        entry.autoManaged !== true ||
        row.after.entries.some(
          current =>
            current.id === entry.id ||
            (current.kind === entry.kind && current.path === entry.path)
        )
      )
        continue;
      const issueId = entry.fixIssueUrl.match(
        /^https:\/\/linear\.app\/jovie\/issue\/(JOV-\d+)(?:\/|$)/
      )[1];
      const key = createHash('sha256')
        .update(`${entry.kind}:${entry.path}`)
        .digest('hex')
        .slice(0, 16);
      plans.push({
        issueId,
        entry,
        commit: row.commit,
        marker: `quarantine-release:${row.commit}:${key}`,
      });
    }
  }
  let posted = 0;
  for (const plan of plans) {
    await lease();
    const found = await list({ issueId: plan.issueId });
    fact(
      found.ok === true &&
        Array.isArray(found.comments) &&
        found.comments.length < 100,
      'Quarantine release comment inventory incomplete'
    );
    if (found.comments.some(row => String(row.body).includes(plan.marker)))
      continue;
    await lease();
    const result = await comment({
      issueId: plan.issueId,
      body: `Quarantine entry ${plan.entry.path} was removed from main in https://github.com/${REPO}/commit/${plan.commit}.\n\n<!-- ${plan.marker} -->`,
    });
    fact(
      result.ok === true &&
        typeof result.id === 'string' &&
        result.id.length > 0,
      'Quarantine release comment failed'
    );
    await lease();
    posted++;
  }
  return { releases: plans.length, posted };
}
export async function main() {
  fact(
    process.env.QUARANTINE_AUTO_HEAL_ENABLED === 'true',
    'Quarantine release recording is disabled'
  );
  const run = (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  const headSha = run('git', ['rev-parse', 'HEAD']);
  fact(
    /^[a-f0-9]{40}$/.test(headSha),
    'Exact quarantine release source required'
  );
  const lease = () =>
    fact(
      run('git', ['rev-parse', 'HEAD']) === headSha &&
        run('gh', [
          'api',
          `repos/${REPO}/git/ref/heads/main`,
          '--jq',
          '.object.sha',
        ]) === headSha,
      'Quarantine release main lease changed'
    );
  lease();
  const commits = run('git', [
    'log',
    '--first-parent',
    '--format=%H',
    '--max-count=1001',
    '--since=7 days ago',
    headSha,
    '--',
    LEDGER,
  ])
    .split('\n')
    .filter(Boolean);
  fact(commits.length <= 1000, 'Quarantine release history exceeds bound');
  const history = commits.map(commit => ({
    commit,
    before: JSON.parse(run('git', ['show', `${commit}^:${LEDGER}`])),
    after: JSON.parse(run('git', ['show', `${commit}:${LEDGER}`])),
  }));
  const result = await recordQuarantineReleases({ history, lease });
  lease();
  console.log(JSON.stringify(result));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
