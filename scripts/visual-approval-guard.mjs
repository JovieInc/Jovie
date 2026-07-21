#!/usr/bin/env node
/**
 * Visual Approval Guard policy.
 *
 * Fails (exit 1) when the given PR changes a visual baseline surface without
 * the `visual-approved` label. Baseline changes define what the product is
 * allowed to look like and must never merge without explicit human visual
 * review — including the scheduled visual-regression.yml self-healing PRs
 * (branch `visual-baselines/auto-update`, author JOVIE_BOT), which regenerate
 * snapshots with `--update-snapshots`. Policy: docs/VISUAL_TESTING_POLICY.md.
 *
 * Pure GitHub REST via `gh` — no repo checkout or install needed.
 *
 * Usage:
 *   GH_TOKEN=... REPO=owner/name node scripts/visual-approval-guard.mjs --pr <number>
 */
import { execFileSync } from 'node:child_process';

// Keep in sync with .github/workflows/visual-approval-guard.yml and
// docs/VISUAL_TESTING_POLICY.md.
const BASELINE_PATTERNS = [
  /^apps\/web\/tests\/e2e\/__snapshots__\//,
  /^apps\/web\/contrast-ratchet\.baseline\.json$/,
  /^apps\/web\/touch-target-ratchet\.baseline\.json$/,
  /^apps\/web\/tests\/unit\/design-system\/button-surface-classes-remaining\.json$/,
];
const SELF_HEALING_BRANCH = 'visual-baselines/auto-update';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const repo = process.env.REPO;
const pr = Number(arg('pr'));
if (!repo || !Number.isInteger(pr) || pr <= 0) {
  console.error(
    'Usage: GH_TOKEN=... REPO=owner/name node scripts/visual-approval-guard.mjs --pr <number>'
  );
  process.exit(2);
}

// The GraphQL-backed `gh pr view` shares an installation quota with the rest
// of the fleet and can fail before checking a two-file PR. Use the REST
// endpoint and retry only transient quota/server failures; every other error
// fails closed. Same retry contract as pr-size-guard.yml.
function gh(args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const stderr = String(err.stderr ?? '');
      const transient =
        /rate limit|HTTP 403|HTTP 429|HTTP 5\d\d|invalid character '<'/i.test(
          stderr
        );
      if (attempt >= 3 || !transient) {
        process.stderr.write(stderr);
        throw err;
      }
      const delay = attempt * 5;
      console.log(
        `Transient GitHub REST failure (attempt ${attempt}/3); retrying in ${delay}s`
      );
      execFileSync('sleep', [String(delay)]);
    }
  }
}

const files = gh([
  'api',
  '--paginate',
  `repos/${repo}/pulls/${pr}/files?per_page=100`,
  '--jq',
  '.[].filename',
])
  .split('\n')
  .filter(Boolean);

const changed = files.filter(f => BASELINE_PATTERNS.some(p => p.test(f)));

if (changed.length === 0) {
  console.log('✅ Visual Approval Guard: no visual baseline files changed.');
  process.exit(0);
}

// One call for labels + source branch (needed to tailor the self-healing
// bot message).
const prMeta = gh([
  'api',
  `repos/${repo}/pulls/${pr}`,
  '--jq',
  '"\\(.head.ref)\\t\\([.labels[].name] | join(","))"',
]).trim();
const tab = prMeta.indexOf('\t');
const headRef = tab === -1 ? prMeta : prMeta.slice(0, tab);
const labels = (tab === -1 ? '' : prMeta.slice(tab + 1))
  .split(',')
  .filter(Boolean);

if (labels.includes('visual-approved')) {
  console.log(
    `✅ Visual Approval Guard: ${changed.length} visual baseline file(s) changed and the \`visual-approved\` label is present.`
  );
  process.exit(0);
}

const fileList = changed.map(f => `   - ${f}`).join('\n');

if (headRef === SELF_HEALING_BRANCH) {
  console.error(`❌ Visual Approval Guard: this PR comes from the scheduled self-healing
visual-regression.yml flow (branch \`${SELF_HEALING_BRANCH}\`, JOVIE_BOT) and
regenerates snapshot baselines with \`--update-snapshots\`:

${fileList}

Regenerated baselines must be visually reviewed by a human before merge —
that review is the entire point of the self-healing flow. Inspect the
Playwright report and the updated snapshots, then apply the
\`visual-approved\` label. This guard re-runs on label events and will turn
green.

Policy: docs/VISUAL_TESTING_POLICY.md`);
} else {
  console.error(`❌ Visual Approval Guard: this PR changes visual baseline file(s):

${fileList}

Baseline changes define what the product is allowed to look like and must
never merge without explicit human visual review.

To proceed:
  1. Regenerate the baselines intentionally:
       pnpm --filter @jovie/web run e2e:visual:update      # public surface
       pnpm --filter @jovie/web run admin:visual:update    # admin surface
     (or edit the ratchet baselines deliberately)
  2. Have a human review the rendered diff (Playwright report / screenshots).
  3. Apply the \`visual-approved\` label to this PR — this guard re-runs on
     label events and will turn green.

Policy: docs/VISUAL_TESTING_POLICY.md`);
}
process.exit(1);
