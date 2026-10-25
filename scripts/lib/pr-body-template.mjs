/**
 * PR body template and pre-create preflight (factory audit 2026-10-25).
 *
 * Nearly every new PR hit the same three reds: no customer-changelog decision block (Source Validation),
 * no Red-before-green section (PR Fleet Rules) and no Storybook story for a UI change (component ship
 * gate). Each is knowable from the diff and the title before the PR exists, so the body is built from a
 * template that carries the decision block and the prompts, and `preflight` runs the same three rules
 * locally. Nothing here calls an API.
 */
import { spawnSync } from 'node:child_process';
import { evaluateLocal, localFiles } from '../pr-fleet-rules.mjs';
import { evaluateCustomerNoteContract } from './daily-changelog-publication.mjs';

const REPAIR_TITLE = /^fix(?:\([^\n)]+\))?!?:/i;
const REPAIR_LABELS = new Set([
  'bug',
  'type:bug',
  'ci-repair',
  'ci-fix',
  'ws:ci',
  'remediation',
  'lane-fix-red',
  'lane-fix-dequeued',
]);
const UI_PATH = /^(?:apps\/web\/components\/|packages\/ui\/)/;
const NOT_SHIPPED_UI =
  /\.(?:test|spec|stories)\.[^/]+$|\/(?:tests|__tests__)\//;

export const isRepair = ({ title = '', labels = [] } = {}) =>
  REPAIR_TITLE.test(title) ||
  labels.some(label => REPAIR_LABELS.has(String(label).toLowerCase()));

/** The body a new PR starts from. `TODO` fields fail the rules until the author replaces them. */
export function buildBody({
  identifier,
  issueId,
  title = '',
  labels = [],
  summary = '',
} = {}) {
  const lines = [];
  if (identifier) lines.push(`Refs ${identifier}.`, '');
  if (issueId) lines.push(`<!-- linear-issue-id:${issueId} -->`);
  if (identifier) lines.push(`<!-- linear-issue-identifier:${identifier} -->`);
  if (issueId || identifier) lines.push('');
  lines.push(
    summary || 'What changed and why, in two sentences.',
    '',
    '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
    '<!-- Changelog decision: internal work keeps releaseWorthy:false. A customer-visible change replaces this block with a',
    '     customer outcome (issueId, outcomeKey, releaseWorthy:true, section, outcome, availability, evidence); see docs/CHANGELOG_PUBLICATION.md. -->',
    ''
  );
  if (isRepair({ title, labels }))
    lines.push(
      '## Red-before-green',
      'Failing command: TODO',
      '<!-- Run the new or changed test on the base WITHOUT your change; paste the exact command above and the red output below. -->',
      '```text',
      'TODO: paste the real FAIL output here',
      '```',
      'Failing run (before fix): TODO',
      ''
    );
  lines.push('## Blast radius', 'What could break: TODO', 'Proof: TODO', '');
  return lines.join('\n');
}

const HINTS = {
  changelog:
    'Add `<!-- customer-changelog/v1 {"releaseWorthy":false} -->` for internal work, or a customer outcome block (docs/CHANGELOG_PUBLICATION.md) for a customer-visible change.',
  'red-before-green':
    'Add a `## Red-before-green` section: `Failing command: <exact command>` plus a fenced block with the real red output (FAIL/Error/AssertionError) or `Failing run (before fix): <run URL>`. Capture it by running the test on the base without your change.',
  story:
    'Add or update the colocated `*.stories.tsx` that imports the changed component (and its test), then re-run `node scripts/component-ship-gate.mjs --diff-base=origin/main --skip-quality --skip-ratchet --skip-rendered-cert --skip-live-storybook`.',
  'locked-areas':
    'Cite `GBrain: <slug>` or `Locking PR: #<n>` in a `## Locked areas` section.',
  'done-receipt':
    'Cite `Merge-group run: <run id or URL>` in the Done receipt, or remove the claim.',
  assertions:
    'Restore the weakened assertions and show the repair with a real red-to-green test.',
};

function runShipGate({ base, cwd }) {
  const done = spawnSync(
    process.execPath,
    [
      'scripts/component-ship-gate.mjs',
      `--diff-base=${base}`,
      '--skip-quality',
      '--skip-ratchet',
      '--skip-rendered-cert',
      '--skip-live-storybook',
    ],
    { cwd, encoding: 'utf8', timeout: 120_000 }
  );
  return {
    code: done.status ?? 1,
    output: `${done.stdout ?? ''}${done.stderr ?? ''}`,
  };
}

/**
 * Run the three rules locally. Returns `{ errors: [{ rule, message, add }] }`; empty means the PR will not
 * be red on these. `gate` is injectable for tests.
 */
export function preflight({
  title,
  body,
  labels = [],
  base = 'origin/main',
  cwd = process.cwd(),
  git,
  gate = runShipGate,
  now = () => new Date().toISOString(),
} = {}) {
  const files = localFiles({ base, cwd, git });
  const names = files.map(file => file.filename);
  const errors = [];
  const note = evaluateCustomerNoteContract({
    files: names,
    body,
    createdAt: now(),
  });
  if (!note.passed)
    errors.push({
      rule: 'changelog',
      message: `customer changelog decision missing or invalid (${note.reason})`,
      add: HINTS.changelog,
    });
  for (const message of evaluateLocal({ title, body, labels, base, cwd, git })
    .errors) {
    const rule = message.split(':')[0];
    errors.push({ rule, message, add: HINTS[rule] ?? '' });
  }
  if (names.some(name => UI_PATH.test(name) && !NOT_SHIPPED_UI.test(name))) {
    const result = gate({ base, cwd });
    if (result.code !== 0) {
      const tail = result.output
        .split('\n')
        .filter(Boolean)
        .slice(-6)
        .join(' | ');
      errors.push({
        rule: 'story',
        message: `component ship gate failed for the changed UI: ${tail}`,
        add: HINTS.story,
      });
    }
  }
  return { errors };
}

export const formatErrors = errors =>
  errors
    .map(
      error =>
        `pr-preflight [${error.rule}]: ${error.message}${error.add ? `\n  add: ${error.add}` : ''}`
    )
    .join('\n');
