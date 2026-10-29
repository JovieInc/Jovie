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
import { afterEach, describe, expect, it } from 'vitest';
import { renderCertificateSummary } from '../component-certificate-summary.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const workflow = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/component-certificate.yml'),
  'utf8'
);
const { load } = createRequire(import.meta.url)('js-yaml');
const job = load(workflow).jobs.certify;
const steps = job.steps;
const fixtureRoots = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
/** @param {{report?: string, workspaceDecoy?: boolean}} options */
function reportUploadEligible({ report, workspaceDecoy = false }) {
  const root = mkdtempSync(
    resolve(tmpdir(), 'component-certificate-artifact-')
  );
  fixtureRoots.push(root);
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
  it.each([false, true])(
    'checks main ancestry before executing checkout scripts (unmerged=%s)',
    unmerged => {
      const root = mkdtempSync(resolve(tmpdir(), 'certificate-lineage-'));
      fixtureRoots.push(root);
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
    expect(restore.with.path).toBe('~/.local/state/jovie-mutation');
    expect(restore.with['restore-keys']).toBe('mutation-sweep-state-');
  });
  it('is event-driven: no cron, no pull_request, main CI completion only', () => {
    expect(workflow).not.toMatch(/^\s*schedule:/mu);
    expect(workflow).not.toMatch(/pull_request/u);
    expect(workflow).toMatch(
      /workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \[main\]/u
    );
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion == 'success'"
    );
  });
  it('installs only typescript, not the workspace', () => {
    expect(workflow).not.toContain('setup-node-pnpm');
    expect(workflow).not.toMatch(/pnpm install/u);
  });
  it('is informational: uncertified components cannot fail the job, the Ovie post cannot either', () => {
    expect(workflow).toContain('scripts/component-certificate.mjs --all');
    expect(workflow).not.toMatch(/--(strict|fail-on)/u);
    const post = workflow.slice(workflow.indexOf('- name: Post to Ovie'));
    expect(post).toContain('CRON_SECRET not available');
    expect(post).toContain('ingest route not deployed');
    expect(post).toMatch(/exit 0\n\n\s+- name: Clean scratch/u);
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
  });
  it('throws on a malformed report so the job fails on a crash', () => {
    expect(() => renderCertificateSummary({})).toThrow();
  });
});
