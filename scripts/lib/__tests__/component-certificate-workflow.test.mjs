import { spawnSync } from 'node:child_process';
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { renderCertificateSummary } from '../component-certificate-summary.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
function workflowText(name) {
  return readFileSync(resolve(REPO_ROOT, '.github/workflows', name), 'utf8');
}
const workflow = workflowText('component-certificate.yml');
const { load } = createRequire(import.meta.url)('js-yaml');
const job = load(workflow).jobs.certify;
const steps = job.steps;
const fixtureRoots = [];
function fixtureRoot(prefix) {
  const root = mkdtempSync(resolve(tmpdir(), prefix));
  fixtureRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
/** @param {{report?: string, workspaceDecoy?: boolean}} options */
function reportUploadEligible({ report, workspaceDecoy = false }) {
  const root = fixtureRoot('component-certificate-artifact-');
  const workspace = resolve(root, 'workspace');
  const runner = resolve(root, 'runner');
  mkdirSync(workspace);
  mkdirSync(resolve(runner, 'component-certificate'), { recursive: true });
  if (report !== undefined)
    writeFileSync(resolve(runner, 'component-certificate/report.json'), report);
  if (workspaceDecoy) {
    mkdirSync(resolve(workspace, 'component-certificate'));
    writeFileSync(
      resolve(workspace, 'component-certificate/report.json'),
      '{"decoy":true}'
    );
  }
  const outputPath = resolve(root, 'outputs');
  const context = {};
  const probe = steps.find(step => step.id === 'certificate_report');
  if (probe) {
    const result = spawnSync('bash', ['-c', probe.run], {
      cwd: workspace,
      env: { ...process.env, RUNNER_TEMP: runner, GITHUB_OUTPUT: outputPath },
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    context[probe.id] = {
      outputs: Object.fromEntries(
        readFileSync(outputPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split('='))
      ),
    };
  }
  const upload = steps.find(step => step.name === 'Upload certificate report');
  const expression = upload.if.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const enabled = Function(
    'always',
    'hashFiles',
    'steps',
    `return (${expression});`
  )(
    () => true,
    pattern =>
      globSync(pattern, { cwd: workspace }).length
        ? 'workspace-file-digest'
        : '',
    context
  );
  return {
    enabled,
    reportExists: existsSync(
      resolve(runner, 'component-certificate/report.json')
    ),
    upload,
  };
}

describe('certificate artifact retention with separate runner and checkout roots', () => {
  it('uploads the actual runner-temp report even when the checkout has no matching file', () => {
    const result = reportUploadEligible({ report: '{"components":[]}' });
    expect(result.reportExists).toBe(true);
    expect(result.enabled).toBe(true);
  });
  it.each([undefined, ''])(
    'does not upload a missing or empty actual report (%s)',
    report => {
      expect(reportUploadEligible({ report }).enabled).toBe(false);
    }
  );
  it('does not let a workspace decoy authorize uploading a missing runner report', () => {
    expect(reportUploadEligible({ workspaceDecoy: true }).enabled).toBe(false);
  });
});

describe('Component Certificate workflow contract', () => {
  it('registers every root Source Validation command, including the certificate gate', () => {
    const source = load(workflowText('source-validation.yml'));
    const contract = source.jobs.deterministic.steps.find(
      step => step.name === 'Run deterministic source contract'
    ).run;
    const commands = [
      ...new Set(
        [...contract.matchAll(/^\s*pnpm (?:run )?([a-z][\w:-]*)/gm)].map(
          match => match[1]
        )
      ),
    ];
    expect(commands).toContain('component-certificate:gate');
    const { scripts } = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
    );
    const missing = registry =>
      commands.filter(name => !registry[name]?.trim());
    expect(missing(scripts)).toEqual([]);
    for (const name of commands) {
      const stale = { ...scripts };
      delete stale[name];
      expect(missing(stale)).toEqual([name]);
    }
  });
  it.each([false, true])(
    'checks main ancestry before executing checkout scripts (unmerged=%s)',
    unmerged => {
      const root = fixtureRoot('certificate-lineage-');
      const gate = steps.find(step => step.name === 'Require main ancestry');
      const commit =
        'git -c user.name=Fixture -c user.email=fixture@example.invalid commit --allow-empty -qm fixture';
      const result = spawnSync(
        'bash',
        [
          '-ec',
          `git init -q
${commit}
git update-ref refs/remotes/origin/main HEAD
${unmerged ? commit : ''}
export CERT_SHA="$(git rev-parse HEAD)" CERT_EVENT_NAME=workflow_dispatch
${gate?.run || 'true'}`,
        ],
        { cwd: root, encoding: 'utf8' }
      );
      expect(result.status, result.stderr).toBe(unmerged ? 1 : 0);
      expect(steps.indexOf(gate)).toBe(1);
      expect(job.if).toContain("github.ref == 'refs/heads/main'");
    }
  );
  it('uses hosted runners and the mutation producer cache contract', () => {
    expect(job['runs-on']).toBe('ubuntu-latest');
    const restore = job.steps.find(
      step => step.name === 'Restore mutation evidence'
    );
    expect(restore.uses).toMatch(/^actions\/cache\/restore@/u);
    expect(restore.with.path).toBe('.cache/jovie-mutation');
    expect(restore.with['restore-keys']).toBe('mutation-sweep-portable-v2-');
  });
  it('restores story-capture receipts and passes them only when they exist', () => {
    const restore = steps.find(step => step.name === 'Restore story evidence');
    expect(restore.uses).toMatch(/^actions\/cache\/restore@/u);
    expect(restore.with.path).toBe('~/.local/state/jovie-story-evidence');
    expect(restore.with['restore-keys']).toBe('component-story-evidence-');
    const build = steps.find(
      step => step.name === 'Build the certificate report'
    );
    expect(steps.indexOf(restore)).toBeLessThan(steps.indexOf(build));
    const runBuild = files => {
      const root = fixtureRoot('certificate-evidence-');
      mkdirSync(resolve(root, 'bin'));
      const dir = resolve(root, '.local/state/jovie-story-evidence');
      mkdirSync(dir, { recursive: true });
      for (const name of files) writeFileSync(resolve(dir, name), '{}');
      for (const tool of ['nice', 'node'])
        writeFileSync(
          resolve(root, 'bin', tool),
          `#!/bin/bash\necho "${tool} $*" >> "${root}/calls.log"\n`,
          { mode: 0o755 }
        );
      const result = spawnSync('bash', ['-c', build.run], {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: `${resolve(root, 'bin')}:${process.env.PATH}`,
          HOME: root,
          RUNNER_TEMP: root,
          GITHUB_STEP_SUMMARY: resolve(root, 'summary.md'),
          CERT_SHA: 'abc',
        },
      });
      expect(result.status, result.stderr).toBe(0);
      return readFileSync(resolve(root, 'calls.log'), 'utf8')
        .split('\n')
        .find(line => line.startsWith('nice '));
    };
    const dir = '/.local/state/jovie-story-evidence';
    const both = runBuild(['visual.json', 'a11y.json']);
    expect(both).toContain(`--visual `);
    expect(both).toContain(`${dir}/visual.json --a11y `);
    expect(both).toContain(`${dir}/a11y.json`);
    const none = runBuild([]);
    expect(none).toContain('scripts/component-certificate.mjs --all');
    expect(none).not.toMatch(/--(visual|a11y)\b/u);
    expect(runBuild(['a11y.json'])).not.toContain('--visual');
  });
  it('installs only typescript, not the workspace', () => {
    expect(workflow).not.toContain('setup-node-pnpm');
    expect(workflow).not.toMatch(/pnpm install/u);
  });
  it('installs typescript for the failed-capture admission before it runs scripts', () => {
    // component-ship-policy.mjs (reached via component-story-receipts.mjs)
    // imports 'typescript' for story-source parsing, and the failed-capture
    // admission job runs node scripts with no workspace install. Without the
    // install step the job dies on module load (JOV-12692).
    const admission = load(workflow).jobs.failed_capture;
    const installs = admission.steps.filter(
      step => step.name === 'Install typescript only'
    );
    expect(installs).toHaveLength(1);
    expect(installs[0].run).toMatch(
      /npm install .*--ignore-scripts "typescript@\$\{version\}"/u
    );
    expect(installs[0].run).not.toMatch(/pnpm install/u);
    // The step resolves its version from the root package.json pin.
    const { devDependencies } = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
    );
    expect(devDependencies.typescript).toEqual(expect.any(String));
    // The install must precede both node script steps it unblocks.
    for (const id of ['canonical', 'Require current capture bindings']) {
      const consumer = admission.steps.find(
        step => step.id === id || step.name === id
      );
      expect(consumer, id).toBeDefined();
      expect(admission.steps.indexOf(installs[0])).toBeLessThan(
        admission.steps.indexOf(consumer)
      );
    }
  });
  it('keeps the failed-capture admission script graph within installed deps', () => {
    // The failed-capture admission job installs ONLY typescript (no
    // workspace install), so every module reachable from
    // scripts/lib/component-story-completion.mjs must import nothing
    // beyond node: builtins and typescript. A new bare import here would
    // ERR_MODULE_NOT_FOUND in that job, not in a local workspace run —
    // this guard is the tripwire (JOV-12692). Parsed with the real
    // typescript AST so comments and string literals never count.
    const bare = new Set();
    const seen = new Set();
    const queue = [
      resolve(REPO_ROOT, 'scripts/lib/component-story-completion.mjs'),
    ];
    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      const queueSpecifier = (specifier, fromFile) => {
        if (specifier.startsWith('node:')) return;
        if (!specifier.startsWith('.')) {
          bare.add(specifier);
          return;
        }
        const target = resolve(fromFile, '..', specifier);
        const found = [
          target,
          `${target}.ts`,
          `${target}.mjs`,
          resolve(target, 'index.ts'),
          resolve(target, 'index.mjs'),
        ].find(candidate => existsSync(candidate));
        expect(
          found,
          `unresolved import ${specifier} in ${fromFile}`
        ).toBeDefined();
        if (found) queue.push(found);
      };
      const visit = node => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          queueSpecifier(node.moduleSpecifier.text, file);
        } else if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          queueSpecifier(node.arguments[0].text, file);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect([...bare].sort()).toEqual(['typescript']);
  });
  it('keeps certification informational but records every requested delivery failure', () => {
    expect(workflow).toContain('scripts/component-certificate.mjs --all');
    expect(workflow).not.toMatch(/--(strict|fail-on)/u);
    const install = steps.find(step => step.name === 'Install Doppler CLI');
    const resolver = steps.find(step => step.name === 'Resolve CRON_SECRET');
    const post = steps.find(step => step.name === 'Post to Ovie');
    expect(install.uses).toBe('./.github/actions/setup-doppler');
    expect(steps.indexOf(install)).toBeLessThan(steps.indexOf(resolver));
    expect(install.if).toBe(resolver.if);
    expect(post.if).toContain('!cancelled()');
    // JOV-12456: delivery posts the bounded compact payload built from the
    // report; the full report is never the request body.
    expect(post.run).toContain(
      'node scripts/lib/component-certificate-delivery.mjs "$report" --out "$payload"'
    );
    expect(post.run).toContain('--data-binary "@${payload}"');
    expect(post.run).not.toContain('--data-binary "@${report}"');
    const receipt = steps.find(step => step.name === 'Upload delivery receipt');
    expect(receipt.if).toContain('always()');
    expect(receipt.with.path).toBe(
      '${{ runner.temp }}/component-certificate/delivery.json'
    );
    expect(steps.indexOf(receipt)).toBeLessThan(
      steps.findIndex(step => step.name === 'Clean scratch')
    );
  });
  it('exposes CRON_SECRET only to the resolve step and read-only permissions', () => {
    expect(workflow).toContain('permissions: {}');
    expect(workflow).not.toMatch(/actions: write|contents: write/u);
    const uses = [...workflow.matchAll(/\$\{\{\s*secrets\.(\w+)/gu)].map(
      m => m[1]
    );
    expect(uses.sort()).toEqual(['CRON_SECRET', 'DOPPLER_TOKEN_PRD']);
  });
});
describe('renderCertificateSummary', () => {
  it('renders totals and per-criterion rows', () => {
    const md = renderCertificateSummary({
      headSha: 'abcdef1234567890',
      totals: {
        components: 3,
        certified: 1,
        byCriterion: { story: { pass: 2, fail: 1, unknown: 0, na: 0 } },
      },
    });
    expect(md).toContain('1 of 3 components certified');
    expect(md).toContain('`abcdef123456`');
    expect(md).toContain('| story | 2 | 1 | 0 | 0 |');
    expect(md).toContain(
      'Report generation: complete. Delivery and persisted ingestion are separate'
    );
    expect(md).toContain('0 unknown criterion results');
    expect(md).toContain('structural evidence, not executed receipts');
    expect(md).toContain(
      'Screenshot hashes prove capture, not visual regression approval'
    );
    expect(md).toContain(
      'does not yet include shared UI/global CSS dependencies'
    );
    expect(md).toContain('Journey N/A does not prove journey coverage');
  });
  it('throws on a malformed report so the job fails on a crash', () => {
    expect(() => renderCertificateSummary({})).toThrow();
  });
});

describe('Visual a11y execution summaries', () => {
  const visual = load(workflowText('visual-a11y.yml'));
  const visualSteps = visual.jobs['storybook-a11y'].steps;
  const passing = {
    success: true,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    testResults: [
      {
        status: 'passed',
        assertionResults: [{ status: 'passed' }, { status: 'passed' }],
      },
    ],
    numTotalTests: 2,
    numPassedTests: 2,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
  };
  it.each([
    ['success', passing, 'PASS: 2 tests passed in this shard.'],
    ['failure', passing, 'FAIL: test command failed'],
    ['skipped', passing, 'SKIPPED:'],
    ['cancelled', passing, 'CANCELLED:'],
    ['', passing, 'UNKNOWN:'],
    ...[
      'numFailedTestSuites',
      'numPendingTestSuites',
      'numPendingTests',
      'numTodoTests',
    ].map(
      key =>
        /** @type {[string, object, string]} */ ([
          'success',
          { ...passing, [key]: 1 },
          'UNKNOWN:',
        ])
    ),
    ['success', { ...passing, testResults: [] }, 'UNKNOWN:'],
    [
      'success',
      { ...passing, testResults: [{ status: 'failed', assertionResults: [] }] },
      'UNKNOWN:',
    ],
    ['success', undefined, 'UNKNOWN:'],
    ['success', 'invalid-json', 'UNKNOWN:'],
    [
      'success',
      { ...passing, numTotalTests: 0, numPassedTests: 0 },
      'UNKNOWN:',
    ],
    ['success', { ...passing, success: false, numFailedTests: 1 }, 'UNKNOWN:'],
  ])('reports %s with %j as %s', (outcome, receipt, expected) => {
    const root = fixtureRoot('a11y-summary-');
    if (receipt !== undefined)
      writeFileSync(
        resolve(root, 'a11y-shard-3.json'),
        typeof receipt === 'string' ? receipt : JSON.stringify(receipt)
      );
    const summary = resolve(root, 'summary.md');
    const result = spawnSync(
      'bash',
      [
        '-c',
        visualSteps
          .find(step => step.name === 'A11y Results Summary')
          .run.replaceAll('${{ matrix.shard }}', '3'),
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          RUNNER_TEMP: root,
          GITHUB_STEP_SUMMARY: summary,
          A11Y_OUTCOME: outcome,
        },
      }
    );
    expect(result.status, result.stderr).toBe(0);
    const md = readFileSync(summary, 'utf8');
    expect(md).toContain(expected);
    expect(md).toContain('shard 3/16');
    expect(md).toContain('not a required PR check');
    if (!expected.startsWith('PASS:')) expect(md).not.toContain('PASS:');
  });
  it('retains JSON and logs without adding a required gate', () => {
    expect(visualSteps.find(step => step.id === 'a11y-test').run).toContain(
      '--reporter=json'
    );
    expect(
      visualSteps.find(step => step.name === 'Upload shard execution evidence')
    ).toMatchObject({ if: 'always()', with: { 'if-no-files-found': 'warn' } });
    expect(visual.on).not.toHaveProperty('pull_request');
  });
});
