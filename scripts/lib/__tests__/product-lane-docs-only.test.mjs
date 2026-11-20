// JOV-12618 slice 1: the docs-only fast path. Merge group run 43632801466
// (#25544) changed only apps/web/AGENTS.md and docs/REVIEW_BAR.md yet ran 88
// jobs, including every web lane and the full structural lane.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyProductLanes,
  runProductLaneClassifier,
} from '../product-lane-classifier.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);

function getJobBlock(workflow, jobKey) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex(
    (line, index) => index > start && /^  [a-zA-Z0-9_-]+:/.test(line)
  );
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}

function getStepBlock(jobBlock, stepName) {
  const lines = jobBlock.split('\n');
  const start = lines.findIndex(line => line === `      - name: ${stepName}`);
  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex(
    (line, index) => index > start && /^      - /.test(line)
  );
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}

function getStepRunScript(jobBlock, stepName) {
  const lines = getStepBlock(jobBlock, stepName).split('\n');
  const runStart = lines.findIndex(line =>
    /^ {8}run: (?:&[\w-]+ )?\|$/.test(line)
  );
  expect(runStart, `Missing run block: ${stepName}`).toBeGreaterThanOrEqual(0);
  return lines
    .slice(runStart + 1)
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
}

describe('docs-only product-lane classification', () => {
  it('classifies agent docs under apps/web as documentation, not web product input (JOV-12618)', () => {
    // Merge group run 43632801466 (#25544) ran every web lane for this diff.
    const receipt = classifyProductLanes([
      'apps/web/AGENTS.md',
      'docs/REVIEW_BAR.md',
    ]);
    expect(receipt.selectedLanes).toEqual(['operations']);
    expect(receipt.documentationOnly).toBe(true);
    expect(receipt.classifications.map(item => item.rule)).toEqual([
      'web-docs',
      'operations-tooling',
    ]);
    for (const path of [
      'apps/web/CLAUDE.md',
      'apps/web/docs/visual-qa-coverage.md',
      'apps/web/screenshot-reports/README.md',
      'apps/web/scripts/marketing-factory/BUDGET.md',
    ]) {
      const docs = classifyProductLanes([path]);
      expect(docs.selectedLanes, path).toEqual(['operations']);
      expect(docs.documentationOnly, path).toBe(true);
    }
  });
  it('keeps shipped, prompt and test-read Markdown under apps/web on the web lane', () => {
    for (const path of [
      'apps/web/content/x.md',
      'apps/web/content/blog/a-safe-article.md',
      'apps/web/content/legal/cookies.md',
      'apps/web/lib/chat/knowledge/topics/monetization.md',
      'apps/web/lib/chat/skills/library/promo-strategy/SKILL.md',
      'apps/web/lib/billing/README.md',
      'apps/web/prompts/system/jovie-chat.md',
      'apps/web/plugins/jovie-music/README.md',
      'apps/web/public/llms.md',
      'apps/web/runtime-data/CHANGELOG.md',
      'apps/web/app/onboarding/README.md',
      'apps/web/components/atoms/Tooltip.README.md',
      'apps/web/tests/TESTING.md',
      'apps/web/.storybook/README.md',
      'apps/web/docs/../lib/x.md',
      'apps/web/app/page.tsx',
      'apps/web/docs/notes.txt',
    ]) {
      const receipt = classifyProductLanes([path]);
      expect(receipt.selectedLanes, path).toContain('web');
      expect(receipt.documentationOnly, path).toBe(false);
    }
  });
  it('runs everything for a mixed docs-plus-code diff', () => {
    const receipt = classifyProductLanes([
      'apps/web/AGENTS.md',
      'docs/REVIEW_BAR.md',
      'apps/web/app/page.tsx',
    ]);
    expect(receipt.selectedLanes).toEqual(['web', 'operations']);
    expect(receipt.documentationOnly).toBe(false);
    for (const paths of [
      ['apps/web/AGENTS.md', 'scripts/ci-fast-lanes.mjs'],
      ['docs/REVIEW_BAR.md', '.github/workflows/README.md'],
      ['docs/REVIEW_BAR.md', 'CHANGELOG.md'],
      ['docs/REVIEW_BAR.md', 'docs/playbooks/x.playbook.md'],
    ]) {
      expect(
        classifyProductLanes(paths).documentationOnly,
        paths.join(',')
      ).toBe(false);
    }
  });
  it('never counts staged runtime copy as documentation', () => {
    // apps/web/scripts/stage-runtime-data.mjs copies these into the deploy;
    // read as text because importing the script copies files.
    const stager = readFileSync(
      resolve(REPO_ROOT, 'apps/web/scripts/stage-runtime-data.mjs'),
      'utf8'
    );
    const listed = (name, suffix = '') =>
      [
        ...(
          stager.match(
            new RegExp(`${name} = Object\\.freeze\\(\\[([^\\]]*)\\]`)
          )?.[1] ?? ''
        ).matchAll(/'([^']+)'/g),
      ].map(match => `${match[1]}${suffix}`);
    const runtimePaths = [
      ...listed('RUNTIME_DATA_FILES'),
      ...listed('RUNTIME_DATA_DIRECTORIES', '/packet.md'),
    ];
    expect(runtimePaths).toContain('docs/FEATURE_REGISTRY.md');
    expect(runtimePaths).toContain('docs/certification/packet.md');
    for (const path of runtimePaths.filter(item => item.endsWith('.md'))) {
      expect(classifyProductLanes([path]).documentationOnly, path).toBe(false);
    }
    expect(classifyProductLanes([]).documentationOnly).toBe(false);
  });
  it('emits docs_only for the Path Changes job', () => {
    const root = mkdtempSync(join(tmpdir(), 'product-lane-docs-only-'));
    const files = join(root, 'files.txt');
    const outputs = join(root, 'github-output.txt');
    const run = paths => {
      writeFileSync(files, `${paths.join('\n')}\n`);
      writeFileSync(outputs, '');
      runProductLaneClassifier([
        '--files-from',
        files,
        '--json-out',
        join(root, 'receipt.json'),
        '--github-output',
        outputs,
      ]);
      return readFileSync(outputs, 'utf8');
    };
    try {
      const docs = run(['apps/web/AGENTS.md', 'docs/REVIEW_BAR.md']);
      expect(docs).toContain('run_web=false\n');
      expect(docs).toContain('docs_only=true\n');
      const mixed = run(['apps/web/AGENTS.md', 'apps/web/app/page.tsx']);
      expect(mixed).toContain('run_web=true\n');
      expect(mixed).toContain('docs_only=false\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('merge-group docs-only structural decision', () => {
  const STRUCTURAL_JOBS = [
    'ci-fast-remaining',
    'ci-fast-structural-python',
    'ci-fast-structural-web',
    'ci-fast-structural-lanes',
  ];
  const scannedEre = spawnSync(
    process.execPath,
    [resolve(REPO_ROOT, 'scripts/invariants/scanned-paths.mjs'), '--ere'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).stdout.trim();

  /** @param {{ docsOnly?: string, changes: string[], base?: string, event?: string }} options */
  function decide({ docsOnly, changes, base, event = 'merge_group' }) {
    const repo = mkdtempSync(join(tmpdir(), 'mg-structural-decision-'));
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    try {
      git('init', '-q');
      git('config', 'user.name', 'Structural Decision Test');
      git('config', 'user.email', 'structural@example.invalid');
      git('config', 'commit.gpgsign', 'false');
      mkdirSync(join(repo, '.github/ci-harness'), { recursive: true });
      writeFileSync(
        join(repo, '.github/ci-harness/structural-control-paths.ere'),
        readFileSync(
          resolve(REPO_ROOT, '.github/ci-harness/structural-control-paths.ere'),
          'utf8'
        )
      );
      mkdirSync(join(repo, 'scripts/invariants'), { recursive: true });
      writeFileSync(
        join(repo, 'scripts/invariants/scanned-paths.mjs'),
        `console.log(${JSON.stringify(scannedEre)});\n`
      );
      git('add', '-A');
      git('commit', '-q', '-m', 'base');
      const baseSha = git('rev-parse', 'HEAD');
      for (const path of changes) {
        mkdirSync(dirname(join(repo, path)), { recursive: true });
        writeFileSync(join(repo, path), `${path}\n`);
      }
      if (changes.length > 0) {
        git('add', '-A');
        git('commit', '-q', '-m', 'head');
      }
      const output = join(repo, 'github-output');
      writeFileSync(output, '');
      const script = getStepRunScript(
        getJobBlock(CI_WORKFLOW, 'ci-fast-remaining'),
        'Decide structural lane'
      )
        .replaceAll('${{ github.event_name }}', event)
        .replaceAll('${{ github.base_ref }}', '');
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GITHUB_OUTPUT: output,
        STRUCTURAL_DIFF_BASE_SHA: base === undefined ? baseSha : base,
      };
      if (docsOnly !== undefined) env.STRUCTURAL_DOCS_ONLY = docsOnly;
      const result = spawnSync('bash', ['-c', script], {
        cwd: repo,
        env,
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      return readFileSync(output, 'utf8').trim();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }

  it('wires the trusted docs-only verdict and classified base into every decision step', () => {
    const pathChanges = getJobBlock(CI_WORKFLOW, 'ci-path-changes');
    expect(pathChanges).toContain(
      "docs_only: ${{ steps.detect.outputs.docs_only || 'false' }}"
    );
    for (const jobId of STRUCTURAL_JOBS) {
      const step = getStepBlock(
        getJobBlock(CI_WORKFLOW, jobId),
        'Decide structural lane'
      );
      expect(step, jobId).toContain(
        'STRUCTURAL_DOCS_ONLY: ${{ needs.ci-path-changes.outputs.docs_only }}'
      );
      expect(step, jobId).toContain(
        'STRUCTURAL_DIFF_BASE_SHA: ${{ needs.ci-path-changes.outputs.path_diff_base_sha }}'
      );
      expect(getJobBlock(CI_WORKFLOW, jobId), jobId).toMatch(
        /needs: \[[^\]]*ci-path-changes/
      );
    }
  });

  it('skips the structural lane for the #25544 docs-only diff', () => {
    expect(
      decide({
        docsOnly: 'true',
        changes: ['apps/web/AGENTS.md', 'docs/REVIEW_BAR.md'],
      })
    ).toBe('skip=true');
  });

  it('runs the structural lane for a mixed docs-plus-code diff', () => {
    const changes = [
      'apps/web/AGENTS.md',
      'docs/REVIEW_BAR.md',
      'apps/web/app/page.tsx',
    ];
    // The classifier reports a mixed diff as not docs-only.
    expect(decide({ docsOnly: 'false', changes })).toBe('skip=false');
    // Even a wrong docs-only verdict cannot skip once the path decision
    // selects a changed file.
    expect(decide({ docsOnly: 'true', changes })).toBe('skip=false');
    expect(
      decide({
        docsOnly: 'true',
        changes: ['docs/REVIEW_BAR.md', 'scripts/new-guard.test.mjs'],
      })
    ).toBe('skip=false');
  });

  it('runs the structural lane for docs the source-PR decision selects', () => {
    expect(decide({ docsOnly: 'true', changes: ['AGENTS.md'] })).toBe(
      'skip=false'
    );
  });

  it('runs the structural lane for docs structural suites assert (JOV-12618)', () => {
    // docs_only stays true for product-lane skip, but structural-control-paths
    // must still select these so unit/ci + structural pytest/lanes content
    // asserts cannot land broken docs through a docs-only merge group.
    for (const path of [
      'README.md',
      'CONTRIBUTING.md',
      'docs/REPO-POLICY.md',
      'docs/SYNTHETIC_MONITORING.md',
      'docs/COST_MONITORING.md',
      'docs/AUTOMATION_AUDIT.md',
      'docs/design/design-brief-template.md',
      'docs/CHANGELOG_PUBLICATION.md',
      'docs/TEST_COVERAGE_HEATMAP.md',
      'docs/NIGHTLY_TESTING_AGENT_REPORT.md',
      'docs/ordinary-reference.md',
      'docs/launch/LAUNCH_GATES.md',
    ]) {
      expect(decide({ docsOnly: 'true', changes: [path] }), path).toBe(
        'skip=false'
      );
    }
  });

  it('fails closed without a verdict, a usable base or a non-empty diff', () => {
    const changes = ['apps/web/AGENTS.md'];
    expect(decide({ docsOnly: undefined, changes })).toBe('skip=false');
    expect(decide({ docsOnly: '', changes })).toBe('skip=false');
    expect(decide({ docsOnly: 'true', changes, base: '' })).toBe('skip=false');
    expect(decide({ docsOnly: 'true', changes, base: 'f'.repeat(40) })).toBe(
      'skip=false'
    );
    expect(decide({ docsOnly: 'true', changes: [] })).toBe('skip=false');
    expect(decide({ docsOnly: 'true', changes, event: 'push' })).toBe(
      'skip=false'
    );
  });
});
