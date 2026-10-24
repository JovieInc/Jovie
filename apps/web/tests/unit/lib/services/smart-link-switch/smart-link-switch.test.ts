import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_SKILL_REGISTRY } from '@/lib/agents/registry';
import { resolveMonorepoRoot } from '@/lib/filesystem-paths';
import {
  ALREADY_LIVE_KEEP_REASON,
  evaluateAllSmartLinkSwitchRuleCases,
  evaluateSmartLinkSwitchRuleCase,
  gateSmartLinkSwitch,
  LOOKUP_STOP_REASON,
  MISSING_LINK_SKIP_REASON,
  SMART_LINK_SWITCH_LIVE_RULES,
  SMART_LINK_SWITCH_RULE_CASE_IDS,
  SWITCHED_LIVE_REASON,
} from '@/lib/services/smart-link-switch/switch-rules';

const ROOT = resolveMonorepoRoot();
const EXISTING = 'https://jov.ie/tim/never-say-a-word';

describe('smart_link_switch_live evidence floor', () => {
  it('encodes 4–5 rule cases', () => {
    expect(SMART_LINK_SWITCH_RULE_CASE_IDS.length).toBeGreaterThanOrEqual(4);
    expect(SMART_LINK_SWITCH_RULE_CASE_IDS.length).toBeLessThanOrEqual(5);
    for (const result of evaluateAllSmartLinkSwitchRuleCases()) {
      expect(result.passed, result.reason).toBe(true);
    }
    for (const id of SMART_LINK_SWITCH_RULE_CASE_IDS) {
      expect(evaluateSmartLinkSwitchRuleCase(id).passed, id).toBe(true);
    }
  });

  it('skips a missing link without minting and STOPs a failed lookup', () => {
    expect(
      gateSmartLinkSwitch({
        lookupStatus: 'missing',
        proposed: { shareUrl: 'https://jov.ie/placeholder', mintNew: true },
      })
    ).toMatchObject({
      disposition: 'skip',
      minted: false,
      switched: false,
      runSucceeded: true,
      shareUrl: null,
      reason: MISSING_LINK_SKIP_REASON,
    });
    const stopped = gateSmartLinkSwitch({
      lookupStatus: 'error',
      lookupError: 'timeout',
      proposed: { shareUrl: 'https://jov.ie/placeholder' },
    });
    expect(stopped).toMatchObject({
      disposition: 'stop',
      stopped: true,
      runSucceeded: false,
      minted: false,
      shareUrl: null,
    });
    expect(stopped.reason).toContain(LOOKUP_STOP_REASON);
    expect(stopped.reason).toContain('timeout');
    expect(JSON.stringify(stopped)).not.toContain('https://jov.ie/placeholder');
  });

  it('trims a padded share url and treats whitespace as no link', () => {
    expect(
      gateSmartLinkSwitch({
        existing: {
          shareUrl: `  ${EXISTING}  `,
          live: true,
          resolvedDsps: ['spotify'],
        },
      })
    ).toMatchObject({
      disposition: 'keep',
      shareUrl: EXISTING,
    });
    expect(
      gateSmartLinkSwitch({
        existing: { shareUrl: '   ', live: true, resolvedDsps: ['spotify'] },
        proposed: { shareUrl: '   ' },
      })
    ).toMatchObject({
      disposition: 'skip',
      shareUrl: null,
    });
  });

  it('keeps an already-live shareUrl and cites only resolved DSPs', () => {
    const kept = gateSmartLinkSwitch({
      existing: {
        shareUrl: EXISTING,
        live: true,
        resolvedDsps: ['spotify'],
      },
      proposed: {
        shareUrl: 'https://jov.ie/tim/never-say-a-word-live',
        mintNew: true,
        claimedDsps: ['spotify', 'tidal'],
      },
    });
    expect(kept).toMatchObject({
      disposition: 'keep',
      switched: false,
      minted: false,
      shareUrl: EXISTING,
      reason: ALREADY_LIVE_KEEP_REASON,
    });
    expect(kept.citedDsps).toEqual(['spotify']);
    expect(kept.omittedInvented).toEqual(
      expect.arrayContaining(['dsp', 'mint'])
    );
  });

  it('encodes the gate in the skill, rules, and playbooks', () => {
    const skill = PUBLIC_SKILL_REGISTRY.smart_link_switch_live;
    expect(skill.id).toBe('smart_link_switch_live');
    expect(skill.description.toLowerCase()).toContain('never invent');
    expect(skill.description.toLowerCase()).toContain('already-live');
    expect(skill.inputSchemaZodPath).toBe(
      'apps/web/lib/services/smart-link-switch/types.ts'
    );
    expect(SMART_LINK_SWITCH_LIVE_RULES).toContain('Never invent a jov.ie URL');
    expect(SMART_LINK_SWITCH_LIVE_RULES).toContain('no-op keep');
    expect(SMART_LINK_SWITCH_LIVE_RULES).toContain('skip switch');
    const announcement = readFileSync(
      resolve(ROOT, 'docs/playbooks/release-day-announcement.playbook.md'),
      'utf8'
    );
    const planner = readFileSync(
      resolve(ROOT, 'docs/playbooks/jovie-release-planner.playbook.md'),
      'utf8'
    );
    expect(announcement).toContain('Never invent a jov.ie URL');
    expect(announcement).toContain('already-live');
    expect(announcement).toContain('missing-link-skips-no-mint');
    expect(announcement).not.toMatch(
      /"expected": "Smart link is switched to live mode\./
    );
    expect(planner).toContain('Never invent a jov.ie URL');
    expect(planner).toContain('no-op keep');
  });
});

const SKIPPED = {
  disposition: 'skip',
  switched: false,
  minted: false,
  runSucceeded: true,
  stopped: false,
  shareUrl: null,
  citedDsps: [],
  omittedInvented: [],
  reason:
    'No smart link exists for this release. Skip switch. Run still succeeds. Do not mint a live link.',
} as const;

const preSave = (over: Record<string, unknown> = {}) => ({
  shareUrl: EXISTING,
  live: false,
  resolvedDsps: ['spotify', 'apple_music'],
  ...over,
});

describe('gateSmartLinkSwitch outcomes', () => {
  it('exposes the exact operator-facing reasons', () => {
    expect(MISSING_LINK_SKIP_REASON).toBe(SKIPPED.reason);
    expect(ALREADY_LIVE_KEEP_REASON).toBe(
      'Smart link is already live. No-op keep. Do not mint a second live link.'
    );
    expect(SWITCHED_LIVE_REASON).toBe(
      'Existing pre-save/countdown smart link switched to live. Same shareUrl. No new link minted.'
    );
    expect(LOOKUP_STOP_REASON).toBe(
      'Smart link lookup/switch failed. STOP. Never invent a jov.ie URL.'
    );
  });

  it('switches an existing pre-save link to live on the same shareUrl', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave({ resolvedDsps: [' spotify ', '', 'apple_music'] }),
      })
    ).toEqual({
      disposition: 'switch',
      switched: true,
      minted: false,
      runSucceeded: true,
      stopped: false,
      shareUrl: EXISTING,
      citedDsps: ['spotify', 'apple_music'],
      omittedInvented: [],
      reason: SWITCHED_LIVE_REASON,
    });
  });

  it('keeps an already-live link without rebuilding it', () => {
    expect(gateSmartLinkSwitch({ existing: preSave({ live: true }) })).toEqual({
      disposition: 'keep',
      switched: false,
      minted: false,
      runSucceeded: true,
      stopped: false,
      shareUrl: EXISTING,
      citedDsps: ['spotify', 'apple_music'],
      omittedInvented: [],
      reason: ALREADY_LIVE_KEEP_REASON,
    });
  });

  it('skips when there is no input or no existing link', () => {
    expect(gateSmartLinkSwitch()).toEqual(SKIPPED);
    expect(gateSmartLinkSwitch({ existing: null })).toEqual(SKIPPED);
    expect(
      gateSmartLinkSwitch({ lookupStatus: 'ok', existing: { shareUrl: null } })
    ).toEqual(SKIPPED);
    expect(
      gateSmartLinkSwitch({ lookupStatus: 'missing', existing: preSave() })
    ).toEqual(SKIPPED);
  });

  it('records a minting attempt and an invented url on a skip', () => {
    expect(
      gateSmartLinkSwitch({
        proposed: { shareUrl: 'https://jov.ie/tim/new', mintNew: true },
      })
    ).toEqual({ ...SKIPPED, omittedInvented: ['mint', 'shareUrl'] });
  });

  it('stops on a lookup error, inferring the status from the message', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave(),
        lookupError: '  lookup timed out ',
        proposed: { shareUrl: 'https://jov.ie/placeholder', mintNew: true },
      })
    ).toEqual({
      disposition: 'stop',
      switched: false,
      minted: false,
      runSucceeded: false,
      stopped: true,
      shareUrl: null,
      citedDsps: [],
      omittedInvented: ['mint', 'placeholder'],
      reason: `${LOOKUP_STOP_REASON} lookup timed out`,
    });
  });

  it('ignores a blank lookup error', () => {
    expect(
      gateSmartLinkSwitch({ existing: preSave(), lookupError: '   ' })
        .disposition
    ).toBe('switch');
  });

  it('prefers the switch error and falls back to a generic detail', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave(),
        lookupError: 'lookup slow',
        switchError: 'write failed',
      }).reason
    ).toBe(`${LOOKUP_STOP_REASON} write failed`);
    expect(gateSmartLinkSwitch({ lookupStatus: 'error' }).reason).toBe(
      `${LOOKUP_STOP_REASON} lookup failed`
    );
    expect(
      gateSmartLinkSwitch({ existing: preSave(), switchError: '  ' })
        .disposition
    ).toBe('switch');
  });
});

describe('gateSmartLinkSwitch proposed URLs', () => {
  it.each([
    'https://jov.ie/placeholder',
    'https://example.com/x',
    'https://jov.ie/your-link',
    'https://jov.ie/YOUR-RELEASE',
    'https://jov.ie/eval/abc',
    'https://jov.ie/todo',
    'https://jov.ie/tbd',
    'https://jov.ie/dummy',
  ])('refuses placeholder %s', shareUrl => {
    const gated = gateSmartLinkSwitch({
      existing: preSave(),
      proposed: { shareUrl },
    });
    expect(gated.omittedInvented).toEqual(['placeholder']);
    expect(gated.shareUrl).toBe(EXISTING);
  });

  it('accepts the canonical url, even padded', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave(),
        proposed: { shareUrl: `  ${EXISTING} ` },
      }).omittedInvented
    ).toEqual([]);
  });

  it('accepts a canonical url that happens to look like a placeholder', () => {
    const canonical = 'https://jov.ie/tim/todo-list';
    expect(
      gateSmartLinkSwitch({
        existing: preSave({ shareUrl: canonical }),
        proposed: { shareUrl: canonical },
      })
    ).toMatchObject({ shareUrl: canonical, omittedInvented: [] });
  });

  it('refuses a different real-looking url', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave(),
        proposed: { shareUrl: 'https://jov.ie/tim/other' },
      }).omittedInvented
    ).toEqual(['shareUrl']);
  });

  it('ignores a blank proposed url and an explicit no-mint', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave(),
        proposed: { shareUrl: '  ', mintNew: false },
      }).omittedInvented
    ).toEqual([]);
  });
});

describe('gateSmartLinkSwitch DSP citations', () => {
  it('cites only resolved DSPs and flags each invented one', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave(),
        proposed: { claimedDsps: [' spotify ', 'tidal', '', 'deezer'] },
      })
    ).toMatchObject({
      citedDsps: ['spotify'],
      omittedInvented: ['dsp', 'dsp'],
    });
  });

  it('cites nothing when the existing link resolved no DSPs', () => {
    expect(
      gateSmartLinkSwitch({
        existing: preSave({ resolvedDsps: null }),
        proposed: { claimedDsps: ['spotify'] },
      })
    ).toMatchObject({ citedDsps: [], omittedInvented: ['dsp'] });
    expect(
      gateSmartLinkSwitch({ existing: preSave({ resolvedDsps: null }) })
        .citedDsps
    ).toEqual([]);
  });
});

describe('smart link switch rule cases', () => {
  it('passes every case with its success reason', () => {
    expect(SMART_LINK_SWITCH_RULE_CASE_IDS).toEqual([
      'placeholder-refused',
      'missing-link-skips-no-mint',
      'already-live-is-noop',
      'failed-lookup-stops',
      'only-resolved-dsps-cited',
    ]);
    expect(evaluateAllSmartLinkSwitchRuleCases()).toEqual([
      {
        id: 'placeholder-refused',
        passed: true,
        reason:
          'Placeholder and minted URLs are refused; existing shareUrl is kept',
      },
      {
        id: 'missing-link-skips-no-mint',
        passed: true,
        reason: 'Missing smart link skips switch, succeeds, and does not mint',
      },
      {
        id: 'already-live-is-noop',
        passed: true,
        reason: 'Already-live is a no-op keep of the existing shareUrl',
      },
      {
        id: 'failed-lookup-stops',
        passed: true,
        reason:
          'Failed lookup/switch STOPs, surfaces the error, and invents no URL',
      },
      {
        id: 'only-resolved-dsps-cited',
        passed: true,
        reason: 'Only DSPs resolved on the existing link are cited',
      },
    ]);
  });
});
