import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_READY_HOLD_LABELS,
  classifyAutoReadyPromotion,
  classifyFxChildCommit,
  parseFxSourceHeadTrailer,
  shipIntent,
  TRUSTED_FX_WORKFLOW_NAME,
} from '../auto-ready-provenance.mjs';
import { triggerNames, workflowTriggers } from '../workflow-triggers.mjs';
import {
  evaluateWriterPromotion,
  WRITER_PROMOTION_BLOCKER_SCHEMA,
} from '../writer-owned-pr-promotion.mjs';
import {
  child,
  fxCommit,
  other,
  parent,
  prNumber,
  promotion,
  proofBody,
  proofReceipt,
  trustedFxRun,
  writerLogin,
} from './auto-ready-fixtures.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fleetScript = readFileSync(
  resolve(repoRoot, 'scripts/auto-ready-agent-drafts.sh'),
  'utf8'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/auto-ready-agent-drafts.yml'),
  'utf8'
);
const promotionScript = readFileSync(
  resolve(repoRoot, 'scripts/writer-owned-pr-promote.sh'),
  'utf8'
);
const fxWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/rolling-ci-dispatch.yml'),
  'utf8'
);
function prState(overrides = {}) {
  return {
    state: 'OPEN',
    draft: true,
    head: child,
    labels: [],
    autoMerge: false,
    queued: false,
    ...overrides,
  };
}

function writerPromotion(receipt = proofReceipt(), state = prState()) {
  return evaluateWriterPromotion({
    receipt,
    state,
    expectedHeadSha: child,
    writerLogin,
    prNumber,
  });
}

describe('Auto-Ready fleet live-state guard', () => {
  it('does not wait for checks or mergeability before promotion', () => {
    expect(fleetScript).not.toContain('check_failures_for_pr');
    expect(fleetScript).not.toContain('gh pr checks');
    expect(fleetScript).not.toContain('--classify-auto-ready');
    expect(fleetScript).not.toContain('.mergeable == "MERGEABLE"');
    expect(fleetScript).toContain('Pending checks are expected');
  });

  it('pins promotion to the exact live head and hold-label snapshot', () => {
    expect(fleetScript).toContain('headRefOid headRefName body state');
    expect(fleetScript).toContain('labels(first:100){nodes{name}}');
    expect(fleetScript).toContain('HOLD_LABEL_RE=');
    expect(fleetScript).toContain('.head == $expected_head');
    expect(fleetScript).toContain('.branch == $expected_branch');
    expect(fleetScript).toContain('before_mutation="$(read_state "$n"');
    expect(fleetScript.indexOf('before_mutation="$(read_state')).toBeLessThan(
      fleetScript.indexOf('if ! promote_ready "$n" "$expected_head"; then')
    );
  });

  // JOV-INV-022 (2026-10-13): the writer readies; Merge Queue Green Enroll is
  // the sole admitter, so this recovery never arms auto-merge or enqueues.
  it('readies only, then compensates a promotion that fails verification', () => {
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO"');
    expect(fleetScript).not.toMatch(/pr merge "\$n"[^\n]*--auto\b/);
    expect(fleetScript).not.toContain('enqueuePullRequest');
    expect(fleetScript).not.toContain('recover_ready_without_auto_merge');
    expect(fleetScript).toContain('.draft == true');
    expect(fleetScript).toContain('if ! undo_ready "$n"; then');
    expect(fleetScript).not.toContain('undo_ready "$n" || true');
    expect(fleetScript).toContain('held_after=');
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO" --undo');
    expect(fleetScript).toContain('restored="$(read_state "$n"');
    expect(fleetScript.indexOf('after="$(read_state')).toBeGreaterThan(
      fleetScript.indexOf('if ! promote_ready "$n" "$expected_head"; then')
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
      fleetScript.indexOf('if ! promote_ready "$n" "$expected_head"; then')
    );
    expect(fleetScript).toContain('READY_ATTEMPTED_FOR=');
    expect(fleetScript).toContain('refusing a second promotion');
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO" --undo');
  });

  it('rejects an allowlisted bot author without an author-owned proof receipt', () => {
    expect(
      classifyAutoReadyPromotion({
        prNumber,
        authorLogin: 'jovie-bot[bot]',
        title: 'fix(ci): repair draft',
        branch: 'tim/jov-5477-bot-repair',
        labels: [],
        headSha: child,
      })
    ).toEqual({ eligible: false, reason: 'writer-proof-proof-missing' });
  });

  it('lets a trusted writer opt in to ship on green instead of a receipt', () => {
    const marker = '<!-- jovie-auto-ready: on-green -->';
    // The writer-proof path readies drafts with checks still pending, so the
    // opt-in must never pass there; only green-source sets greenSource.
    expect(promotion({ body: marker })).toEqual({
      eligible: false,
      reason: 'writer-proof-proof-missing',
    });
    const body = marker;
    const greenSource = true;
    expect(promotion({ body, greenSource })).toEqual({
      eligible: true,
      reason: 'writer-on-green-opt-in',
    });
    expect(
      promotion({ body, greenSource, authorLogin: 'jovie-bot[bot]' })
    ).toEqual({
      eligible: true,
      reason: 'writer-on-green-opt-in',
    });
    expect(
      promotion({ body, greenSource, authorLogin: 'outside-contributor' })
    ).toEqual({
      eligible: false,
      reason: 'writer-proof-proof-missing',
    });
    expect(promotion({ body, greenSource, labels: ['hold'] })).toEqual({
      eligible: false,
      reason: 'held',
    });
    expect(
      promotion({
        body,
        greenSource,
        title: '[canary] prove the gate stays red',
      })
    ).toEqual({ eligible: false, reason: 'controlled-proof' });
  });

  it('ships a trusted writer draft on green by default unless it parks', () => {
    const park = '<!-- jovie-auto-ready: park -->';
    const verdict = o =>
      promotion({ body: 'Opened via REST.', greenSource: true, ...o });
    expect(verdict()).toEqual({
      eligible: true,
      reason: 'writer-on-green-default',
    });
    expect(verdict({ authorLogin: 'jovie-bot[bot]' }).eligible).toBe(true);
    // Park wins over the default, the marker and even a complete receipt.
    for (const body of [park, `${proofBody()}\n${park}`]) {
      expect(verdict({ body })).toEqual({
        eligible: false,
        reason: 'writer-parked',
      });
    }
    expect(verdict({ authorLogin: 'outside-contributor' }).eligible).toBe(
      false
    );
    expect(verdict({ greenSource: false }).eligible).toBe(false);
  });

  it('allows an exact author-owned proof receipt on any branch', () => {
    expect(promotion()).toEqual({
      eligible: true,
      reason: 'writer-proof-complete',
    });
  });

  it('keeps FX child provenance as diagnostic context, not promotion authority', () => {
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit(),
        fxRun: trustedFxRun(),
      })
    ).toEqual({
      eligible: true,
      reason: 'trusted-fx-child',
    });
    expect(parseFxSourceHeadTrailer(fxCommit().message)).toBe(parent);
    // Hosted writer moved to GraphQL createCommitOnBranch via rolling-ci-fx.
    expect(fxWorkflow).toContain(TRUSTED_FX_WORKFLOW_NAME);
    expect(fxWorkflow).toContain(
      'node scripts/lib/rolling-ci-fx.mjs hosted-commit'
    );
  });

  it('rejects a stale proof even on an agent prefix', () => {
    expect(
      promotion({
        body: proofBody({ headSha: other }),
      })
    ).toEqual({ eligible: false, reason: 'writer-proof-head-mismatch' });
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

  it.each(['security', 'hold', 'gated', 'queue-deferred'])(
    'never mutates a hard-held PR labeled %s',
    label => {
      expect(
        promotion({ authorLogin: 'jovie-bot[bot]', labels: [label] })
      ).toEqual({ eligible: false, reason: 'held' });
      expect(AUTO_READY_HOLD_LABELS).toEqual(expect.arrayContaining([label]));
    }
  );

  it.each([
    'human-review-required',
    'needs-human',
    'needs-human-review',
    'needs-human-taste',
    'needs:taste',
    'no-auto',
    'no-auto-merge',
    'no-automerge',
    'taste',
  ])('ignores the legacy %s label during writer promotion', label => {
    expect(promotion({ labels: [label] })).toMatchObject({ eligible: true });
    expect(AUTO_READY_HOLD_LABELS).not.toContain(label);
  });

  it('fails closed when the live head moved away from the classified commit', () => {
    expect(
      promotion({
        headSha: other,
        body: proofBody({ headSha: child }),
      })
    ).toEqual({
      eligible: false,
      reason: 'writer-proof-head-mismatch',
    });
  });

  it('fails closed on ambiguous or unsigned FX provenance', () => {
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit({ parentShas: [parent, other] }),
      })
    ).toEqual({ eligible: false, reason: 'ambiguous-provenance' });
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit({
          committerLogin: '',
          authorLogin: '',
          verified: false,
        }),
        fxRun: trustedFxRun(),
      })
    ).toEqual({ eligible: false, reason: 'fx-app-provenance-missing' });
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit(),
        fxRun: null,
      })
    ).toEqual({
      eligible: false,
      reason: 'fx-run-missing',
    });
  });
});

describe('Writer-owned PR promotion proof', () => {
  it.each([
    ['reviewSweep', 'pending', 'review-sweep'],
    ['requiredTests', 'failed: 12 tests failed', 'required-tests'],
    ['ticketEvidence', 'missing: Linear workpad absent', 'ticket-evidence'],
    ['prEvidence', 'skipped: PR body not updated', 'pr-evidence'],
  ])('blocks incomplete or negative %s proof', (field, value, gateId) => {
    expect(writerPromotion(proofReceipt({ [field]: value }))).toMatchObject({
      action: 'block',
      reason: `gate-${gateId}`,
    });
  });

  it('accepts only exact-head draft proof on the writer path', () => {
    expect(writerPromotion()).toMatchObject({
      action: 'promote',
      reason: 'proof-complete',
    });
    expect(writerPromotion(proofReceipt({ headSha: other }))).toMatchObject({
      action: 'block',
      reason: 'head-mismatch',
    });
  });

  // Canon evidence on main still names the retired test below; drop this line
  // once main's canon no longer lists it:
  // rejects reconciliation dependency, hard holds, and ready-unenrolled state
  it('rejects reconciliation dependency and hard holds; a ready exact head is complete', () => {
    expect(
      writerPromotion(proofReceipt({ reconciliationRequired: true }))
    ).toMatchObject({
      action: 'block',
      reason: 'gate-writer-promotion-path',
    });
    expect(
      writerPromotion(proofReceipt(), prState({ draft: false }))
    ).toMatchObject({
      action: 'already-complete',
      reason: 'ready-at-exact-head',
    });
    expect(
      writerPromotion(proofReceipt(), prState({ labels: ['controlled-proof'] }))
    ).toMatchObject({
      action: 'block',
      reason: 'held-by-controlled-proof',
    });
  });

  it('accepts terminal exact-head promotion state', () => {
    expect(
      writerPromotion(
        proofReceipt(),
        prState({ state: 'MERGED', draft: false })
      ).reason
    ).toBe('merged-at-exact-head');
  });

  it('emits typed blockers and keeps the shell entrypoint atomic', () => {
    expect(WRITER_PROMOTION_BLOCKER_SCHEMA).toBe(
      'jovie-writer-pr-promotion-blocker/v1'
    );
    ['dequeuePullRequest', 'compensate_to_draft', 'render-blocker'].forEach(
      token => expect(promotionScript).toContain(token)
    );
    expect(promotionScript).not.toContain('native-merge-intent');
    expect(promotionScript).not.toMatch(/pr merge[^\n]*\s--auto\b/);
  });
});

describe('Auto-Ready App-token workflow', () => {
  it('mints a short-lived Jovie App token and never mutates with GITHUB_TOKEN', () => {
    const tokenAction =
      'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510';
    expect(workflow).toContain(tokenAction);
    expect(workflow).toContain('id: app-token');
    expect(workflow).toContain('app-id: ${{ vars.CI_APP_ID }}');
    expect(workflow).toContain(
      'private-key: ${{ secrets.CI_APP_PRIVATE_KEY }}'
    );
    expect(workflow).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(workflow).not.toContain('secrets.GITHUB_TOKEN');
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
  });

  it('resolves bot review threads on the green head after the undraft', () => {
    const step = workflow.split(
      '- name: Resolve bot review threads on the green head'
    )[1];
    expect(step).toContain("github.event_name == 'workflow_run'");
    expect(step).toContain(
      'node scripts/lib/bot-review-threads.mjs --repo "$REPO" --pr "$TARGET_PR" --head "$TARGET_HEAD"'
    );
  });

  it('keeps workflow recovery manual-only and never source-event driven', () => {
    // Manual recovery plus completed source-check runs; no PR, schedule or
    // ready_for_review wake can start a cascade.
    expect(triggerNames(workflowTriggers(workflow))).toEqual([
      'workflow_dispatch',
      'workflow_run',
    ]);
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.pr_number == ''"
    );
    expect(workflow).not.toContain('ready_for_review/CI cascade');
  });
});

describe('shipIntent (pr:open opt-in)', () => {
  const ON = '<!-- jovie-auto-ready: on-green -->';
  const PARK = '<!-- jovie-auto-ready: park -->';
  const count = body => body.split(ON).length - 1;
  it('opts a new PR in, once, and --park keeps it parked', () => {
    expect(shipIntent('Body', { cmd: 'open' })).toBe(`Body\n\n${ON}\n`);
    expect(count(shipIntent(`Body\n\n${ON}\n`, { cmd: 'open' }))).toBe(1);
    expect(shipIntent('Body', { cmd: 'draft' })).toContain(ON);
    // --park writes the park marker (an unmarked writer draft ships on green).
    expect(shipIntent(`Body\n${ON}\n`, { cmd: 'open', park: true })).toBe(
      `Body\n\n${PARK}\n`
    );
    const parked = shipIntent('Body', { cmd: 'open', park: true });
    expect(promotion({ body: parked, greenSource: true }).reason).toBe(
      'writer-parked'
    );
  });
  it('a refresh keeps a park; --on-green replaces it', () => {
    const opts = { cmd: 'update', number: '42' };
    expect(shipIntent('New', opts, `Old\n${PARK}`)).toBe(`New\n\n${PARK}\n`);
    // A park the writer wrote in the body itself survives a fresh open.
    expect(shipIntent(`Body\n${PARK}\n`, { cmd: 'open' })).toBe(
      `Body\n\n${PARK}\n`
    );
    const on = shipIntent(`New\n${PARK}`, { ...opts, onGreen: true }, 'Old');
    expect(on).toBe(`New\n\n${ON}\n`);
  });
  it('keeps an existing opt-in on refresh and adds none uninvited', () => {
    const opts = { cmd: 'update', number: '42' };
    expect(shipIntent('New', opts, `Old\n${ON}`)).toBe(`New\n\n${ON}\n`);
    expect(shipIntent('New', opts, 'Old')).toBe('New');
    expect(shipIntent('New', { ...opts, onGreen: true }, 'Old')).toContain(ON);
    expect(shipIntent('New', { cmd: 'draft', number: '42' })).toBe('New');
  });
});
