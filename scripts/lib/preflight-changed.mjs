/**
 * Pure helpers for `pnpm preflight:changed` (JOV-9727): PR-body lint with a
 * paste-ready template for whatever is missing, and the companion-edit
 * checklist for new workflows, scripts, migrations and registries. No
 * filesystem or git access here; the CLI passes in file lists and a reader.
 */
import { evaluateCustomerNoteContract } from './daily-changelog-publication.mjs';

const CUSTOMER_MARKER =
  '<!-- customer-changelog/v1 {"releaseWorthy":false} -->';

const heading = (body, name) =>
  new RegExp(`^#{1,6}\\s*${name}\\b`, 'im').test(body ?? '');

/** True when the title or labels mark the PR as a repair (Fleet Rules). */
export function isRepairPr({ title = '', labels = [], body = '' }) {
  return (
    /^fix(?:\([^\n)]+\))?!?:/i.test(title) ||
    labels.some(l => /^(?:bug|fix|hotfix|regression|repair)$/i.test(l)) ||
    /- \[x\] Bug fix/i.test(body)
  );
}

const TEMPLATES = {
  'red-before-green': () =>
    [
      '## Red-before-green',
      '',
      '- Failing command: `<command that failed before this fix>`',
      '- Failing run (before fix): <https://github.com/JovieInc/Jovie/actions/runs/RUN_ID>',
    ].join('\n'),
  'blast-radius': files =>
    [
      '## Blast radius',
      '',
      `- What could break: <behaviour outside the diff that depends on ${summarize(files)}>`,
      '- Proof: <test, command or run that shows it does not>',
    ].join('\n'),
  'locked-areas': () =>
    ['## Locked areas', '', 'GBrain: design/design-operating-system'].join(
      '\n'
    ),
  'changelog-marker': () => CUSTOMER_MARKER,
};

function summarize(files) {
  const tops = [
    ...new Set(
      files.map(f => f.split('/').slice(0, 2).join('/')).filter(Boolean)
    ),
  ].slice(0, 3);
  return tops.length ? tops.join(', ') : 'the changed paths';
}

/**
 * Lint a PR body against every body-level rule CI enforces.
 * `evaluateFleetRules` is injected so this module stays import-light.
 * Returns { errors: [{id,message}], warnings: [..], template: string }.
 */
export function lintPrBody({
  body,
  title = '',
  labels = [],
  files,
  evaluateFleetRules,
  createdAt = new Date().toISOString(),
}) {
  const paths = files.map(f => f.filename);
  const fleet = evaluateFleetRules({
    pr: { title, body, labels },
    files,
  });
  const errors = [];
  const warnings = [];
  const missing = new Set();
  const classify = message => {
    const id = message.split(':')[0];
    if (TEMPLATES[id]) missing.add(id);
    return { id, message };
  };
  for (const message of fleet.errors) errors.push(classify(message));
  for (const message of fleet.warnings) {
    // Blast radius is a Fleet Rules warning but CI rounds start on it, and a
    // two-line section is cheap: treat a missing one as an error here.
    if (message.startsWith('blast-radius:')) errors.push(classify(message));
    else warnings.push({ id: message.split(':')[0], message });
  }
  const verdict = evaluateCustomerNoteContract({
    files: paths,
    body,
    createdAt,
  });
  if (!verdict.passed) {
    missing.add('changelog-marker');
    errors.push({
      id: 'changelog-marker',
      message: `changelog-marker: customer-facing code changed; the body needs ${CUSTOMER_MARKER} (internal work) or a releaseWorthy:true marker with availability (${verdict.reason}).`,
    });
  }
  const template = [...missing].map(id => TEMPLATES[id](paths)).join('\n\n');
  return { errors, warnings, template };
}

const added = (files, re) =>
  files.filter(f => f.status === 'added' && re.test(f.filename));

/**
 * Companion edits a new or changed artifact needs before CI will accept it.
 * `files`: [{ filename, status }]; `read(path)` returns text or ''.
 * Returns [{ trigger, item, done, hint }]; only `done:false` items are red.
 */
export function companionChecklist(files, read) {
  const names = new Set(files.map(f => f.filename));
  const has = path => names.has(path);
  const items = [];
  const push = (trigger, item, done, hint) =>
    items.push({ trigger, item, done: Boolean(done), hint });

  for (const wf of added(files, /^\.github\/workflows\/[^/]+\.ya?ml$/)) {
    const base = wf.filename.split('/').pop();
    const text = read(wf.filename);
    push(
      wf.filename,
      'ownership entry in canon/ownership.json',
      has('canon/ownership.json') &&
        read('canon/ownership.json').includes(base),
      `add an entry naming ${base} with an agent owner, then run \`pnpm ownership:check\``
    );
    push(
      wf.filename,
      'workflow topology regenerated',
      has('.github/workflow-topology.gen.yml'),
      'run `pnpm ci:topology:write` and commit .github/workflow-topology.gen.yml (preflight:changed does this for you)'
    );
    if (/^\s*-?\s*cron:|schedule:/m.test(text))
      push(
        wf.filename,
        'automation registry entry (scheduled workflow)',
        has('canon/automation-registry.jsonl'),
        'add a live entry to canon/automation-registry.jsonl'
      );
    if (/github\.token|GITHUB_TOKEN|\bgh\s+(?:api|pr|run|issue)\b/.test(text))
      push(
        wf.filename,
        'github-token-budget line',
        /github-token-budget:\s*\d+/.test(text),
        'add `# github-token-budget: <N> calls/run - <reason>` above the step that spends the token (scripts/workflow-token-budget-guard.mjs)'
      );
    if (/continue-on-error/.test(text))
      push(
        wf.filename,
        'no continue-on-error (gate-weakening detector)',
        false,
        'remove continue-on-error or move the step out of a gating job'
      );
  }

  for (const file of added(
    files,
    /^scripts\/(?:.+\/)?[^/]+\.test\.(?:mjs|ts|mts)$/
  )) {
    const wired = ['scripts/ci-fast-lanes.mjs', 'package.json'].some(p =>
      has(p)
    );
    push(
      file.filename,
      'new scripts test wired into a CI lane',
      wired,
      'add it to SCRIPT_CONTRACT_NODE_TESTS / SCRIPT_CONTRACT_VITEST_TESTS in scripts/ci-fast-lanes.mjs'
    );
  }

  for (const file of added(
    files,
    /^apps\/web\/drizzle\/migrations\/\d+_[^/]+\.sql$/
  )) {
    const nums = added(
      files,
      /^apps\/web\/drizzle\/migrations\/\d+_[^/]+\.sql$/
    );
    push(
      file.filename,
      'exactly one migration in this PR',
      nums.length === 1,
      'Migration Guard allows one new migration per PR; split the rest'
    );
    const n = file.filename.match(/migrations\/(\d+)_/)[1];
    push(
      file.filename,
      'snapshot and journal updated',
      has(`apps/web/drizzle/migrations/meta/${n}_snapshot.json`) &&
        has('apps/web/drizzle/migrations/meta/_journal.json'),
      'run drizzle-kit generate so meta/<n>_snapshot.json and _journal.json change with the SQL'
    );
  }

  for (const file of added(
    files,
    /^(?:canon\/[^/]+\.(?:json|jsonl)|ops\/registry\/[^/]+|scripts\/[^/]+\.(?:mjs|py|sh))$/
  )) {
    if (/^scripts\/.*\.test\./.test(file.filename)) continue;
    const text = read(file.filename);
    if (
      /https?:\/\/(?:api\.github\.com|api\.linear\.app)|\bgh\s+api\b/.test(text)
    )
      push(
        file.filename,
        'external API call goes through packages/api-client',
        false,
        'route provider calls through the api-client layer (external-api-guard); see .claude/rules/external-apis.md'
      );
  }
  return items;
}

export const PR_BODY_SKELETON = [
  '## What',
  '',
  '<one paragraph>',
  '',
  CUSTOMER_MARKER,
  '',
  TEMPLATES['blast-radius']([]),
].join('\n');

export { CUSTOMER_MARKER, heading };

/**
 * Turn component-ship-gate violations into the exact files to add or touch.
 * The gate prints `- <component path>: <detail>`; the detail names a story
 * base or a test path, but not the full path an agent has to create.
 */
export function explainShipGate(output) {
  const out = [];
  for (const line of String(output).split('\n')) {
    const m = line.match(/^\s*-\s+(\S+\.tsx?):\s+(.*)$/);
    if (!m) continue;
    const [, source, detail] = m;
    const dir = source.slice(0, source.lastIndexOf('/'));
    const base = source
      .slice(source.lastIndexOf('/') + 1)
      .replace(/\.tsx?$/, '');
    if (/No adjacent .*\.stories\.tsx/.test(detail))
      out.push(`add story: ${dir}/${base}.stories.tsx  (for ${source})`);
    else if (/No colocated .*\.test\.tsx/.test(detail))
      out.push(
        `add test: ${dir}/${base}.test.tsx  (for ${source}), or a verified // @coverage-via directive`
      );
    else if (/was not touched in this diff/.test(detail)) {
      const test = detail.match(/test (\S+) was not touched/)?.[1];
      out.push(
        `touch test: ${test ?? `${dir}/${base}.test.tsx`}  (for ${source})`
      );
    }
  }
  return out;
}

/** Conflicting paths from `git merge-tree --write-tree` output. */
export function parseMergeConflicts(output) {
  return [
    ...new Set(
      [
        ...String(output).matchAll(
          /CONFLICT \([^)]*\): (?:Merge conflict in )?(.+)/g
        ),
      ].map(m => m[1].trim())
    ),
  ];
}
