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
