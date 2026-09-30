import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_CREATIVE_ROLES,
  MARKETING_MODEL_CHANNEL_ORDER,
  MARKETING_MODEL_ROLES,
  MARKETING_ROLE_MODEL_CANDIDATES,
  marketingModelCandidatesForRole,
  selectMarketingModelCandidate,
  selectMarketingModelWithReceipt,
} from '@/data/marketing';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
);

interface Registry {
  routing_policy: {
    rules: string[];
    scoped_exceptions?: { rule: string; scope: string; approved_at: string }[];
  };
  models: { provider: string; family: string; model: string }[];
  marketing_roles: {
    channel_order: string[];
    roles: Record<string, { candidates: unknown[] }>;
  };
}

const registry = JSON.parse(
  readFileSync(
    resolve(
      REPO_ROOT,
      'scripts/backlog-orchestrator/config/model-registry.json'
    ),
    'utf8'
  )
) as Registry;

describe('marketing model roles (model-registry.json projection)', () => {
  it('matches the registry exactly, so the JSON stays the source of truth', () => {
    expect(registry.marketing_roles.channel_order).toEqual([
      ...MARKETING_MODEL_CHANNEL_ORDER,
    ]);
    expect(Object.keys(registry.marketing_roles.roles)).toEqual([
      ...MARKETING_MODEL_ROLES,
    ]);
    for (const role of MARKETING_MODEL_ROLES) {
      expect(registry.marketing_roles.roles[role]?.candidates).toEqual(
        MARKETING_ROLE_MODEL_CANDIDATES[role]
      );
    }
  });

  it('lists each role in channel preference order with family-prefixed ids', () => {
    for (const role of MARKETING_MODEL_ROLES) {
      const candidates = MARKETING_ROLE_MODEL_CANDIDATES[role];
      expect(candidates.length).toBeGreaterThan(0);
      const ranks = candidates.map(c =>
        MARKETING_MODEL_CHANNEL_ORDER.indexOf(c.channel)
      );
      expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
      for (const candidate of candidates) {
        expect(candidate.id.startsWith(`${candidate.family}/`)).toBe(true);
        expect(candidate.quality).toBeGreaterThan(0);
        expect(candidate.quality).toBeLessThanOrEqual(100);
      }
    }
  });

  it('scopes the Claude exception to marketing roles; engineering routes keep no_claude', () => {
    expect(registry.routing_policy.rules).toContain('no_claude');
    expect(registry.routing_policy.scoped_exceptions).toEqual([
      expect.objectContaining({
        rule: 'no_claude',
        scope: 'marketing_roles',
        approved_at: '2026-09-29',
      }),
    ]);
    for (const model of registry.models) {
      expect(`${model.provider} ${model.family} ${model.model}`).not.toMatch(
        /anthropic|claude/i
      );
    }
  });

  it('keeps raw API channels behind subscriptions for every role', () => {
    for (const role of MARKETING_MODEL_ROLES) {
      const [first] = MARKETING_ROLE_MODEL_CANDIDATES[role];
      expect(first?.channel).not.toBe('api');
    }
  });
});

describe('selectMarketingModelCandidate from the registry', () => {
  it('prefers a subscription candidate and records the choice', () => {
    const { candidate, receipt } = selectMarketingModelWithReceipt({
      role: 'copy-compiler',
    });
    expect(candidate?.id).toBe('anthropic/claude-opus-5.5');
    expect(receipt).toMatchObject({
      modelRole: 'copywriter',
      source: 'registry',
      selectedId: 'anthropic/claude-opus-5.5',
      channel: 'subscription',
    });
  });

  it('never selects the generator family', () => {
    const { candidate, receipt } = selectMarketingModelWithReceipt({
      role: 'copy-compiler',
      generatorModel: 'anthropic/claude-sonnet-5',
    });
    expect(candidate?.id).toBe('openai/gpt-5.6-sol');
    expect(receipt.rejected).toContainEqual({
      id: 'anthropic/claude-opus-5.5',
      reason: 'generator-family',
    });
  });

  it('never seats a text-only model in a role that needs vision', () => {
    const { receipt } = selectMarketingModelWithReceipt({
      role: 'adversarial-reviewer',
    });
    expect(receipt.rejected).toContainEqual({
      id: 'zai/glm-5.3',
      reason: 'missing-capability',
    });
    expect(selectMarketingModelCandidate({ role: 'asset-generator' })?.id).toBe(
      'openai/gpt-image-1.5'
    );
  });

  it('falls through to the gateway when subscriptions are unhealthy, and to null when nothing is', () => {
    const subscriptionsDown = marketingModelCandidatesForRole(
      'copy-compiler',
      id => id.startsWith('zai/')
    );
    expect(
      selectMarketingModelWithReceipt({
        role: 'copy-compiler',
        candidates: subscriptionsDown,
      }).candidate?.channel
    ).toBe('gateway');
    expect(
      selectMarketingModelCandidate({
        role: 'copy-compiler',
        candidates: marketingModelCandidatesForRole(
          'copy-compiler',
          () => false
        ),
      })
    ).toBeNull();
  });

  it('seats every creative role from the registry', () => {
    for (const role of MARKETING_CREATIVE_ROLES) {
      expect(selectMarketingModelCandidate({ role })).not.toBeNull();
    }
  });
});
