import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_SKILL_REGISTRY } from '@/lib/agents/registry';
import { resolveMonorepoRoot } from '@/lib/filesystem-paths';
import {
  evaluateAllFanEmailRuleCases,
  FAN_EMAIL_RULE_CASE_IDS,
} from '@/lib/services/fan-email/send-rule-cases';
import {
  EMPTY_LIST_SKIP_REASON,
  FAN_EMAIL_SEND_RULES,
  gateFanEmailSend,
  UNKNOWN_LIST_SKIP_REASON,
} from '@/lib/services/fan-email/send-rules';

const ROOT = resolveMonorepoRoot();

describe('fan email no-invent + human-send gate', () => {
  it('encodes 3–5 rule cases and skips unknown lists', () => {
    expect(FAN_EMAIL_RULE_CASE_IDS.length).toBeGreaterThanOrEqual(3);
    expect(FAN_EMAIL_RULE_CASE_IDS.length).toBeLessThanOrEqual(5);
    for (const result of evaluateAllFanEmailRuleCases()) {
      expect(result.passed, result.reason).toBe(true);
    }
    expect(
      gateFanEmailSend({ sendIntent: 'queue_for_approval' })
    ).toMatchObject({
      disposition: 'skip',
      skipReason: UNKNOWN_LIST_SKIP_REASON,
      queued: false,
      runSucceeded: true,
    });
    expect(
      gateFanEmailSend({
        retrieved: { listSize: 0, observedAt: '2026-08-21T00:00:00.000Z' },
      })
    ).toMatchObject({
      disposition: 'skip',
      skipReason: EMPTY_LIST_SKIP_REASON,
      sent: false,
    });
    expect(
      gateFanEmailSend({
        retrieved: { listSize: 40, observedAt: '2026-08-21T00:00:00.000Z' },
        sendIntent: 'auto_send',
        humanSignOff: true,
      })
    ).toMatchObject({ sent: false, scheduled: false, queued: true });
  });

  it('encodes the gate in the skill, rules, and playbooks', () => {
    const skill = PUBLIC_SKILL_REGISTRY.fan_email_send;
    expect(FAN_EMAIL_SEND_RULES).toContain('Never fabricate');
    expect(FAN_EMAIL_SEND_RULES).toContain('Human-only send');
    expect(skill.id).toBe('fan_email_send');
    expect(skill.description.toLowerCase()).toContain('never auto-send');
    const announcement = readFileSync(
      resolve(ROOT, 'docs/playbooks/release-day-announcement.playbook.md'),
      'utf8'
    );
    expect(announcement).toContain('unverifiable');
    expect(announcement).toContain('queue-for-approval');
    expect(announcement).not.toContain(
      'one email send is queued to the fan list'
    );
  });
});
