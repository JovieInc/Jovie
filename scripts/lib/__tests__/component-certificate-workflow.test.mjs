import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderCertificateSummary } from '../component-certificate-summary.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const workflow = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/component-certificate.yml'),
  'utf8'
);

describe('Component Certificate workflow contract', () => {
  it('runs on the gem pool only, with no hosted fallback', () => {
    const runsOn = [...workflow.matchAll(/^\s+runs-on:\s*(.+)$/gmu)].map(m =>
      m[1].trim()
    );
    expect(runsOn).toEqual(['[self-hosted, Linux, X64, jovie-fixed]']);
    expect(workflow).not.toMatch(/ubuntu-/u);
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
