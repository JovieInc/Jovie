// Shared publication transport and qualified repair priority, owned by pr-open.
// api-budget: github-user-core 300/hr - existing on-demand publication/read calls, at most 30 per update
// api-budget: github-user-graphql 100/hr - existing on-demand publication metadata, at most 10 per update
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { section } from '../pr-fleet-rules.mjs';
import { classifyCiRisk, loadCiHarnessManifest } from './ci-harness.mjs';
import { isRepairPr } from './preflight-changed.mjs';

/** Called only after all body/diff gates pass. Reuse the existing repair reserve for
 * evidence-qualified corrections on canonical correctness/control-plane surfaces.
 * This changes request priority, never the bucket, balance, checks or attempt bound.
 * @param {{title: string, body: string, labels: string[], files: {filename: string}[], evidence?: {failingCommand?: string, failingRun?: string}}} input
 */
export function admissionPriority({
  title,
  body,
  labels,
  files,
  evidence = {},
}) {
  if (
    !isRepairPr({ title, body, labels }) ||
    !evidence.failingCommand ||
    !(
      evidence.failingRun ||
      /```text\n[^]*?\bFAIL\b[^]*?```/.test(section(body, 'Red-before-green'))
    )
  )
    return 'default';
  const correctness = new Set([
    'auth-identity',
    'billing-money',
    'proxy-middleware',
    'ci-workflows',
    'agent-control-plane',
  ]);
  const risk = classifyCiRisk(
    files.map(file => file.filename),
    loadCiHarnessManifest()
  );
  return risk.matchedRules.some(rule => correctness.has(rule.id))
    ? 'repair'
    : 'default';
}

/** @type {(cwd: string, args: string[], options?: object) => {status: number|null, stdout: string, stderr: string, error?: Error}} */
export const runGithub = (
  cwd,
  args,
  { once = false, priority = 'default', ...opts } = {}
) =>
  spawnSync(
    'node',
    [
      path.join(cwd, 'packages/api-client/cli.ts'),
      'gh',
      '--priority',
      priority,
      ...(once ? ['--once'] : []),
      '--',
      ...args,
    ],
    { cwd, encoding: 'utf8', ...opts }
  );
