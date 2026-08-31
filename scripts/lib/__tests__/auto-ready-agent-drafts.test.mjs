import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_READY_HOLD_LABELS,
  classifyAutoReadyPromotion,
  FX_WRITER_EMAIL,
  FX_WRITER_NAME,
  parseFxSourceHeadTrailer,
  TRUSTED_FX_WORKFLOW_NAME,
  TRUSTED_FX_WORKFLOW_PATH,
} from '../auto-ready-provenance.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fleetScript = readFileSync(
  resolve(repoRoot, 'scripts/auto-ready-agent-drafts.sh'),
  'utf8'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/auto-ready-agent-drafts.yml'),
  'utf8'
);
const fxWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/rolling-ci-dispatch.yml'),
  'utf8'
);
const parent = 'a'.repeat(40);
const child = 'b'.repeat(40);
const other = 'c'.repeat(40);

function trustedFxRun(overrides = {}) {
  return {
    workflowPath: TRUSTED_FX_WORKFLOW_PATH,
    workflowName: TRUSTED_FX_WORKFLOW_NAME,
    conclusion: 'success',
    event: 'workflow_run',
    headSha: parent,
    ...overrides,
  };
}

function fxCommit(overrides = {}) {
  return {
    sha: child,
    message: `fix(ci): remediate exact-head failure\n\nFX-Source-Head: ${parent}\n`,
    parentShas: [parent],
    authorName: FX_WRITER_NAME,
    authorEmail: FX_WRITER_EMAIL,
    authorLogin: '',
    committerName: FX_WRITER_NAME,
    committerEmail: FX_WRITER_EMAIL,
    committerLogin: 'jovie-bot[bot]',
    verified: true,
    ...overrides,
  };
}

function promotion(overrides = {}) {
  return classifyAutoReadyPromotion({
    authorLogin: 'itstimwhite',
    title: 'fix(ci): remediate exact-head failure',
    branch: 'tim/jov-5477-human-draft',
    labels: [],
    headSha: child,
    commit: fxCommit(),
    fxRun: trustedFxRun(),
    ...overrides,
  });
}

describe('Auto-Ready fleet live-state guard', () => {
  it('does not wait for checks or mergeability before paired promotion', () => {
    expect(fleetScript).not.toContain('check_failures_for_pr');
    expect(fleetScript).not.toContain('gh pr checks');
    expect(fleetScript).not.toContain('--classify-auto-ready');
    expect(fleetScript).not.toContain('.mergeable == "MERGEABLE"');
    expect(fleetScript).toContain(
      'Existing source checks may still be pending'
    );
  });

  it('pins promotion to the exact live head and hold-label snapshot', () => {
    expect(fleetScript).toContain(
      'autoMergeRequest{enabledAt} isInMergeQueue mergeQueueEntry{id}'
    );
    expect(fleetScript).toContain('labels(first:100){nodes{name}}');
    expect(fleetScript).toContain('HOLD_LABEL_RE=');
    expect(fleetScript).toContain('.head == $expected_head');
    expect(fleetScript).toContain('.branch == $expected_branch');
    expect(fleetScript).toContain('before_mutation="$(read_state "$n"');
    expect(fleetScript.indexOf('before_mutation="$(read_state')).toBeLessThan(
      fleetScript.indexOf(
        'promote_with_auto_merge "$n" "$expected_head" || pair_status=$?'
      )
    );
  });

  it('pairs ready and auto-merge, then compensates any incomplete pair', () => {
    const ready = 'gh_retry pr ready "$n" -R "$REPO"';
    const autoMerge = 'gh_retry pr merge "$n" -R "$REPO" --auto --squash';
    expect(fleetScript).toContain(ready);
    expect(fleetScript).toContain(autoMerge);
    expect(fleetScript.indexOf(ready)).toBeLessThan(
      fleetScript.indexOf(autoMerge)
    );
    expect(fleetScript).toContain('auto-merge request failed after ready');
    expect(fleetScript).toContain('--match-head-commit "$expected_head"');
    expect(fleetScript).toContain(
      'gh_retry pr merge "$n" -R "$REPO" --disable-auto'
    );
    expect(fleetScript).toContain('if ! undo_ready "$n"; then');
    expect(fleetScript).toContain('after="$(read_state "$n"');
    expect(fleetScript).toContain('auto_merge_after=');
    expect(fleetScript).toContain('queued_after=');
    expect(fleetScript).toContain(
      '( "$auto_merge_after" == "true" || "$queued_after" == "true" )'
    );
    expect(fleetScript).toContain('held_after=');
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO" --undo');
    expect(fleetScript).toContain('restored="$(read_state "$n"');
    expect(fleetScript.indexOf('after="$(read_state')).toBeGreaterThan(
      fleetScript.indexOf(
        'promote_with_auto_merge "$n" "$expected_head" || pair_status=$?'
      )
    );
  });

  it('reconciles an interrupted ready-without-auto-merge state', () => {
    expect(fleetScript).toContain('recover_ready_without_auto_merge');
    expect(fleetScript).toContain('state_needs_pairing');
    expect(fleetScript).toContain(
      '.draft == false and .autoMerge == false and .queued == false'
    );
    expect(fleetScript).not.toContain('undo_ready "$n" || true');
    expect(fleetScript).toContain(
      'stopping: #$n could not be returned to a closed-loop state'
    );
  });
});

describe('Auto-Ready provenance selector', () => {
  it('discovers PR author and exact head instead of trusting branch prefixes', () => {
    expect(fleetScript).toContain(
      '--json number,title,isDraft,labels,headRefName,headRefOid,author'
    );
    expect(fleetScript).toContain('author: (.author.login // "")');
    expect(fleetScript).toContain('auto-ready-provenance.mjs');
    expect(fleetScript).toContain('resolve_promotion');
    expect(fleetScript).not.toContain(
      'select((.head | test("^(tim/|codex/|agent/|claude/|linear/|codegen-bot/)"))'
    );
    expect(fleetScript).not.toContain('dependabot/');
  });

  it('revalidates provenance immediately before mutation', () => {
    expect(fleetScript).toContain('mutation_verdict="$(resolve_promotion');
    expect(
      fleetScript.indexOf('mutation_verdict="$(resolve_promotion')
    ).toBeLessThan(
      fleetScript.indexOf(
        'promote_with_auto_merge "$n" "$expected_head" || pair_status=$?'
      )
    );
    expect(fleetScript).toContain('READY_ATTEMPTED_FOR=');
    expect(fleetScript).toContain('refusing a second paired promotion');
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO" --undo');
  });

  it('allows an allowlisted bot author on any branch', () => {
    expect(
      classifyAutoReadyPromotion({
        authorLogin: 'jovie-bot[bot]',
        title: 'fix(ci): repair draft',
        branch: 'tim/jov-5477-bot-repair',
        labels: [],
      })
    ).toEqual({ eligible: true, reason: 'trusted-bot-author' });
  });

  it('allows an exact FX child when trailer, parent, writer, and App/run match', () => {
    expect(promotion()).toEqual({
      eligible: true,
      reason: 'trusted-fx-child',
    });
    expect(parseFxSourceHeadTrailer(fxCommit().message)).toBe(parent);
    expect(fxWorkflow).toContain(`git config user.name "${FX_WRITER_NAME}"`);
    expect(fxWorkflow).toContain(`git config user.email "${FX_WRITER_EMAIL}"`);
    expect(fxWorkflow).toContain(`-m "FX-Source-Head: $SOURCE_HEAD"`);
    expect(fxWorkflow).toContain(TRUSTED_FX_WORKFLOW_NAME);
  });

  it('never promotes a human-authored unrepaired head, even on an agent prefix', () => {
    expect(
      promotion({
        commit: {
          sha: child,
          message: 'fix: human patch',
          parentShas: [parent],
          authorName: 'Tim White',
          authorEmail: 'tim@example.com',
          authorLogin: 'itstimwhite',
          committerLogin: 'itstimwhite',
          verified: false,
        },
        fxRun: null,
      })
    ).toEqual({ eligible: false, reason: 'human-authored-unrepaired' });
  });

  it.each([
    ['canary', { labels: ['canary'] }],
    ['controlled-proof', { labels: ['controlled-proof'] }],
    ['deliberate-red', { title: 'fix(ci): [deliberate-red] fixture' }],
    ['canary branch', { branch: 'canary/jov-5477-proof' }],
  ])('fails closed on controlled-proof marker %s', (_name, overrides) => {
    expect(promotion({ authorLogin: 'jovie-bot[bot]', ...overrides })).toEqual({
      eligible: false,
      reason: 'controlled-proof',
    });
  });

  it.each([
    'needs:taste',
    'security',
    'needs-human',
    'hold',
    'no-auto',
  ])('never mutates a hard-held PR labeled %s', label => {
    expect(
      promotion({ authorLogin: 'jovie-bot[bot]', labels: [label] })
    ).toEqual({ eligible: false, reason: 'held' });
    expect(AUTO_READY_HOLD_LABELS).toEqual(expect.arrayContaining([label]));
  });

  it('fails closed when the live head moved away from the classified commit', () => {
    expect(promotion({ headSha: other })).toEqual({
      eligible: false,
      reason: 'moved-head',
    });
  });

  it('fails closed on ambiguous or unsigned FX provenance', () => {
    expect(
      promotion({
        commit: fxCommit({ parentShas: [parent, other] }),
      })
    ).toEqual({ eligible: false, reason: 'ambiguous-provenance' });
    expect(
      promotion({
        commit: fxCommit({
          committerLogin: '',
          authorLogin: '',
          verified: false,
        }),
      })
    ).toEqual({ eligible: false, reason: 'fx-app-provenance-missing' });
    expect(promotion({ fxRun: null })).toEqual({
      eligible: false,
      reason: 'fx-run-missing',
    });
  });
});

describe('Auto-Ready App-token workflow', () => {
  it('mints a short-lived Jovie App token and never mutates with GITHUB_TOKEN', () => {
    const tokenAction =
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1';
    expect(workflow).toContain(tokenAction);
    expect(workflow).toContain('id: app-token');
    expect(workflow).toContain('app-id: ${{ vars.JOVIE_BOT_APP_ID }}');
    expect(workflow).toContain(
      'private-key: ${{ secrets.JOVIE_BOT_PRIVATE_KEY }}'
    );
    expect(workflow).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(workflow).not.toContain('secrets.GITHUB_TOKEN');
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
  });

  it('runs on source changes but never on the ready transition', () => {
    expect(workflow).toContain('types: [opened, synchronize, reopened]');
    expect(workflow).not.toContain('types: [ready_for_review');
    expect(workflow).not.toContain('ready_for_review/CI cascade');
  });
});
