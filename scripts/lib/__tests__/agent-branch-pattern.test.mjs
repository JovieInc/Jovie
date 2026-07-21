import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AGENT_OPEN_PR_BRANCH_JQ_TEST,
  countOpenAgentPrs,
  extractHeadRef,
  isOpenAgentPrBranch,
} from '../agent-branch-pattern.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('agent-branch-pattern (open-agent-PR capacity)', () => {
  it('matches prefix-owned agent automation branches', () => {
    expect(isOpenAgentPrBranch('codex/gh-10463-fix')).toBe(true);
    expect(isOpenAgentPrBranch('claude/some-work')).toBe(true);
    expect(isOpenAgentPrBranch('codegen-bot/auto')).toBe(true);
    expect(isOpenAgentPrBranch('linear/jov-1-thing')).toBe(true);
  });

  it('matches personal jov branches with -, _, or bare id (issue #10463)', () => {
    // Dispatcher previously required a trailing "-" and missed underscore forms.
    expect(isOpenAgentPrBranch('tim/jov-123_fix')).toBe(true);
    expect(isOpenAgentPrBranch('tim/jov-123-fix')).toBe(true);
    expect(isOpenAgentPrBranch('tim/jov-123')).toBe(true);
    expect(isOpenAgentPrBranch('agent/jov-99-x')).toBe(true);
    expect(isOpenAgentPrBranch('Tim/JOV-123_fix')).toBe(true);
  });

  it('rejects non-agent and merge-queue synthetic branches', () => {
    expect(isOpenAgentPrBranch('feature/foo')).toBe(false);
    expect(isOpenAgentPrBranch('hotfix/prod')).toBe(false);
    expect(isOpenAgentPrBranch('main')).toBe(false);
    expect(isOpenAgentPrBranch('gtmq_14279')).toBe(false);
    expect(isOpenAgentPrBranch('tim/not-a-ticket')).toBe(false);
    expect(isOpenAgentPrBranch('')).toBe(false);
    expect(isOpenAgentPrBranch(null)).toBe(false);
  });

  it('extracts head refs from gh pr list and REST pull shapes', () => {
    expect(extractHeadRef({ headRefName: 'codex/a' })).toBe('codex/a');
    expect(extractHeadRef({ head: { ref: 'tim/jov-1-x' } })).toBe(
      'tim/jov-1-x'
    );
    expect(extractHeadRef({ head: 'tim/jov-2' })).toBe('tim/jov-2');
  });

  it('counts open agent PRs identically for both list shapes', () => {
    const prListShape = [
      { headRefName: 'codex/a' },
      { headRefName: 'tim/jov-123_fix' },
      { headRefName: 'feature/human' },
      { headRefName: 'gtmq_1' },
    ];
    const restShape = [
      { head: { ref: 'codex/a' } },
      { head: { ref: 'tim/jov-123_fix' } },
      { head: { ref: 'feature/human' } },
      { head: { ref: 'gtmq_1' } },
    ];
    expect(countOpenAgentPrs(prListShape)).toBe(2);
    expect(countOpenAgentPrs(restShape)).toBe(2);
    // Paginated REST after jq -s
    expect(countOpenAgentPrs([restShape.slice(0, 2), restShape.slice(2)])).toBe(
      2
    );
  });

  it('documents a jq test that stays aligned with isOpenAgentPrBranch', () => {
    expect(AGENT_OPEN_PR_BRANCH_JQ_TEST).toContain(
      'codex|codegen-bot|linear|claude'
    );
    expect(AGENT_OPEN_PR_BRANCH_JQ_TEST).toContain('jov-[0-9]+([_-].+)?');
  });

  it('workflows consume the shared module (no divergent inline capacity regex)', () => {
    const workflows = [
      'github-ai-dispatcher.yml',
      'github-ai-orchestrator.yml',
      'auto-pr-on-push.yml',
      'agent-tick.yml',
    ];
    for (const name of workflows) {
      const text = readFileSync(
        `${repoRoot}/.github/workflows/${name}`,
        'utf8'
      );
      expect(text).toContain('scripts/lib/agent-branch-pattern.mjs');
      // Capacity listing must paginate so all gates see the same PR universe.
      expect(text).toMatch(/gh api --paginate .*pulls\?state=open/);
      // Old divergent forms must not reappear as capacity filters.
      expect(text).not.toMatch(/test\("\^\[\^\/\]\+\/jov-\[0-9\]\+-"; "i"\)/);
      expect(text).not.toMatch(
        /headRefName \| test\("\^\(codex\|claude\|codegen-bot\|linear\)\//
      );
      expect(text).not.toMatch(
        /head\.ref \| test\("\^\(codex\|codegen-bot\|linear\|claude\)\//
      );
    }
  });

  it('actionlint is not push/PR-triggered (agent-branch push → zero runs)', () => {
    const text = readFileSync(
      `${repoRoot}/.github/workflows/actionlint.yml`,
      'utf8'
    );
    // Standalone actionlint is manual; structural contract covers PR path.
    expect(text).toMatch(/^\s*workflow_dispatch:\s*$/m);
    expect(text).not.toMatch(/^\s*push:\s*$/m);
    expect(text).not.toMatch(/^\s*pull_request(_target)?:\s*$/m);
    expect(text).toMatch(/cancel-in-progress:\s*true/);
  });

  it('CodeQL runs on main push + schedule only (not every PR)', () => {
    const text = readFileSync(
      `${repoRoot}/.github/workflows/codeql.yml`,
      'utf8'
    );
    expect(text).toMatch(/branches:\s*\[['"]main['"]\]/);
    expect(text).toMatch(/schedule:/);
    expect(text).not.toMatch(/^\s*pull_request(_target)?:/m);
    expect(text).toMatch(/cancel-in-progress:\s*true/);
  });

  it('SonarCloud is nightly/manual only (not every PR)', () => {
    const text = readFileSync(
      `${repoRoot}/.github/workflows/sonarcloud.yml`,
      'utf8'
    );
    expect(text).toMatch(/schedule:/);
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*pull_request(_target)?:/m);
    expect(text).toMatch(/cancel-in-progress:\s*true/);
  });
});
