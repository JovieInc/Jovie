import { describe, expect, it } from 'vitest';
import { check, loadAll } from '../../fleet-registry.mjs';
import { validateFleetRegistry } from '../fleet-registry.mjs';

const base = () => structuredClone(loadAll());
const run = ({ registry, identities, capacity }) =>
  validateFleetRegistry(registry, {
    identities,
    providerIds: capacity.providers.map(p => p.id),
  });
const agent = (r, id) => r.registry.agents.find(a => a.id === id);

describe('fleet registry (committed data)', () => {
  it('validates against identities and capacity providers', () => {
    expect(check()).toEqual([]);
  });
  it('carries the agents named in the 2026-10-28 brief', () => {
    const ids = loadAll().registry.agents.map(a => a.id);
    for (const id of [
      'instinct',
      'grokbot',
      'muse',
      'hyperagent',
      'lane-codex',
      'cursor',
    ])
      expect(ids).toContain(id);
  });
  it('records Groxy as unresolved rather than inventing it', () => {
    const { registry } = loadAll();
    expect(registry.agents.some(a => /groxy/i.test(a.id))).toBe(false);
    expect(registry.unresolved.map(u => u.name)).toContain('Groxy');
  });
  it('records local subscription proxies as forbidden and Hyperagent models without Opus', () => {
    const r = loadAll().registry;
    for (const id of ['cliproxyapi', 'kimi-coding-oauth-proxy', 'grok-cli']) {
      const a = r.agents.find(x => x.id === id);
      expect(a.tos.verdict).toBe('forbidden');
      expect(a.standingWorkloads).toEqual([]);
    }
    expect(
      r.agents.find(x => x.id === 'hyperagent').limits.models
    ).not.toContain('claude-opus-5-5');
  });
  it('never routes the forbidden Claude subscription lane', () => {
    const lane = agent(loadAll(), 'lane-claude');
    expect(lane.tos.verdict).toBe('forbidden');
    expect(lane.standingWorkloads).toEqual([]);
  });
});

describe('fleet registry rules', () => {
  it('rejects a forbidden or restricted agent with standing workloads', () => {
    const r = base();
    agent(r, 'lane-claude').standingWorkloads = ['pr-review'];
    expect(run(r).join()).toMatch(/cannot carry standing workloads/);
    const c = base();
    const chloe = agent(c, 'chloe');
    chloe.standingWorkloads = ['pr-review'];
    expect(run(c).join()).toMatch(/restricted agents cannot carry/);
  });
  it('requires a checked primary source for an allowed verdict', () => {
    const r = base();
    agent(r, 'hyperagent').tos.checkedAt = null;
    expect(run(r).join()).toMatch(/allowed verdict needs tos.checkedAt/);
  });
  it('requires outbound workloads to be draft-only', () => {
    const r = base();
    r.registry.workloads.find(
      w => w.id === 'prospect-research-outreach'
    ).draftOnly = false;
    expect(run(r).join()).toMatch(/outbound work must be draftOnly/);
  });
  it('requires capabilities for standing workloads and a registered mesh kind', () => {
    const r = base();
    agent(r, 'instinct').capabilities = [];
    expect(run(r).join()).toMatch(/needs capability/);
    const m = base();
    agent(m, 'muse').route.senderKind = 'nobody';
    expect(run(m).join()).toMatch(/differs from identity mesh.senderKind/);
  });
  it('rejects unknown joins, duplicate ids and secrets', () => {
    const r = base();
    agent(r, 'instinct').identityId = 'ghost';
    agent(r, 'dots').capacityProviderId = 'ghost';
    r.registry.agents.push(structuredClone(agent(r, 'muse')));
    r.registry.description += ' sk-abcdefghijklmnop';
    const joined = run(r).join('\n');
    expect(joined).toMatch(/identityId ghost/);
    expect(joined).toMatch(/capacityProviderId ghost/);
    expect(joined).toMatch(/duplicated/);
    expect(joined).toMatch(/secrets or addresses/);
  });
});
