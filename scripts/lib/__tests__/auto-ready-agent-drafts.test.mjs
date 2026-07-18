import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fleetScript = readFileSync(
  resolve(repoRoot, 'scripts/auto-ready-agent-drafts.sh'),
  'utf8'
);
const classifier = readFileSync(
  resolve(repoRoot, 'scripts/lib/pr-check-failures.mjs'),
  'utf8'
);

describe('Auto-Ready fleet live-state guard', () => {
  it('uses the canonical queue proof without the retired Verify Draft gate', () => {
    expect(fleetScript).toContain('--classify-auto-ready');
    expect(fleetScript).not.toContain('Verify Draft Agent PR');
    expect(classifier).toContain(
      '`--classify-auto-ready` is a compatibility alias for the canonical queue'
    );
    expect(classifier).not.toContain('requireVerifyDraft');
    expect(classifier).toContain("'Verify Draft Agent PR',");
  });

  it('pins promotion to the exact live head and hold-label snapshot', () => {
    expect(fleetScript).toContain(
      '--json isDraft,headRefOid,headRefName,labels,mergeable,state'
    );
    expect(fleetScript).toContain('HOLD_LABEL_RE=');
    expect(fleetScript).toContain('.head == $expected_head');
    expect(fleetScript).toContain('.branch == $expected_branch');
    expect(fleetScript).toContain('before_mutation="$(read_state "$n"');
    expect(fleetScript.indexOf('before_mutation="$(read_state')).toBeLessThan(
      fleetScript.indexOf('if ! mark_ready "$n"')
    );
  });

  it('re-reads after promotion and compensates a racing hold or head change', () => {
    expect(fleetScript).toContain('after="$(read_state "$n"');
    expect(fleetScript).toContain('held_after=');
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO" --undo');
    expect(fleetScript).toContain('restored="$(read_state "$n"');
    expect(fleetScript.indexOf('after="$(read_state')).toBeGreaterThan(
      fleetScript.indexOf('if ! mark_ready "$n"')
    );
  });
});
