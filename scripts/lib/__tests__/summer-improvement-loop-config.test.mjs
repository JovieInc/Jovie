import { describe, expect, it } from 'vitest';
import {
  buildDeploymentBody,
  KEYCHAIN_SERVICE,
  keychainItemExists,
  loadLoopConfig,
  maxRunsPerMonth,
  readKeychainSecret,
  redactBody,
  resolveRepoTokens,
  validateLoopConfig,
  worstCaseMonthlyUsd,
} from '../summer-improvement-loop-config.mjs';

const fresh = () => structuredClone(loadLoopConfig());
const ids = {
  agentId: 'agent_01test',
  environmentId: 'env_01test',
  memoryStoreId: 'memstore_01test',
};

describe('summer improvement loop config', () => {
  it('committed config passes every guardrail', () => {
    expect(validateLoopConfig(fresh())).toEqual([]);
  });

  it('keeps the worst-case month under $150 with $50 headroom', () => {
    const { runs, capUsd, totalUsd } = worstCaseMonthlyUsd(fresh().schedule);
    expect(capUsd).toBeLessThanOrEqual(1);
    expect(runs).toBe(124);
    expect(totalUsd).toBeLessThanOrEqual(150);
  });

  it.each([
    ['17 */6 * * *', 124],
    ['0 */4 * * *', 186],
    ['5 * * * *', 744],
    ['0 3,15 * * *', 62],
  ])('counts monthly firings for %s', (expr, runs) => {
    expect(maxRunsPerMonth(expr)).toBe(runs);
  });

  it('rejects cron shapes it cannot bound', () => {
    expect(() => maxRunsPerMonth('*/5 * * * *')).toThrow(/minute/);
    expect(() => maxRunsPerMonth('0 9 * * 1-5')).toThrow(/day-of-week/);
  });

  it('fails a schedule that would overspend', () => {
    const cfg = fresh();
    cfg.schedule.schedule.expression = '0 */4 * * *';
    expect(validateLoopConfig(cfg).join('\n')).toMatch(/exceeds \$150/);
  });

  it('fails a per-session cap above $1.00 or in decimal form', () => {
    const cfg = fresh();
    cfg.schedule.budget.max_list_cost.amount = '150';
    expect(validateLoopConfig(cfg).join('\n')).toMatch(/exceeds 100/);
    cfg.schedule.budget.max_list_cost.amount = '1.00';
    expect(validateLoopConfig(cfg).join('\n')).toMatch(
      /integer string of cents/
    );
  });

  it('fails when web tools, MCP servers or extra hosts are added', () => {
    const cfg = fresh();
    cfg.agent.tools[0].configs = [];
    cfg.agent.mcp_servers = [
      { type: 'url', name: 'x', url: 'https://x.example' },
    ];
    cfg.environment.config.networking.allowed_hosts.push('example.com');
    const out = validateLoopConfig(cfg).join('\n');
    expect(out).toMatch(/web_search must be explicitly disabled/);
    expect(out).toMatch(/MCP servers/);
    expect(out).toMatch(/unexpected allowed host: example.com/);
  });

  it('fails when a guardrail is dropped from the system prompt', () => {
    const cfg = fresh();
    cfg.system = cfg.system.replaceAll('--no-verify', 'skip hooks');
    expect(validateLoopConfig(cfg).join('\n')).toMatch(
      /lost guardrail: --no-verify/
    );
  });

  it('fails when a token is committed to a config file', () => {
    const cfg = fresh();
    cfg.raw['schedule.yaml'] += `\n# ${'github_pat_'}${'A'.repeat(30)}\n`;
    expect(validateLoopConfig(cfg).join('\n')).toMatch(
      /schedule.yaml looks like it contains a secret/
    );
  });

  it('builds a deployment body with both repos, memory and the budget', () => {
    const body = buildDeploymentBody(fresh(), {
      ...ids,
      env: { LOOP_GITHUB_TOKEN: 't0k' },
    });
    expect(body.agent).toBe('agent_01test');
    expect(body.budget).toEqual({
      type: 'limit',
      max_list_cost: { amount: '100', currency: 'USD' },
    });
    expect(body.resources.map(r => r.url ?? r.memory_store_id)).toEqual([
      'https://github.com/JovieInc/Jovie',
      'https://github.com/JovieInc/summer-config',
      'memstore_01test',
    ]);
    expect(JSON.stringify(redactBody(body))).not.toContain('t0k');
  });

  it('refuses to build without a token or with a wrong id', () => {
    expect(() => buildDeploymentBody(fresh(), { ...ids, env: {} })).toThrow(
      /LOOP_GITHUB_TOKEN/
    );
    expect(() =>
      buildDeploymentBody(fresh(), {
        ...ids,
        agentId: 'x',
        env: { LOOP_GITHUB_TOKEN: 't' },
      })
    ).toThrow(/agentId/);
  });

  it('prefers the env token and falls back to the Keychain item', () => {
    const cfg = fresh();
    const asked = [];
    const fromKeychain = service => {
      asked.push(service);
      return 'kc-token';
    };
    expect(
      resolveRepoTokens(cfg, { LOOP_GITHUB_TOKEN: 'env-token' }, fromKeychain)
        .LOOP_GITHUB_TOKEN
    ).toBe('env-token');
    expect(asked).toEqual([]);
    expect(resolveRepoTokens(cfg, {}, fromKeychain).LOOP_GITHUB_TOKEN).toBe(
      'kc-token'
    );
    expect(asked[0]).toBe(KEYCHAIN_SERVICE);
    expect(
      resolveRepoTokens(cfg, {}, () => null).LOOP_GITHUB_TOKEN
    ).toBeUndefined();
  });

  it('reads the Keychain with -w and checks existence without it', () => {
    const calls = [];
    const fake = status => (cmd, args) => {
      calls.push([cmd, ...args]);
      return { status, stdout: status === 0 ? 'secret\n' : '' };
    };
    expect(readKeychainSecret(KEYCHAIN_SERVICE, fake(0))).toBe('secret');
    expect(readKeychainSecret(KEYCHAIN_SERVICE, fake(44))).toBeNull();
    expect(keychainItemExists(KEYCHAIN_SERVICE, fake(0))).toBe(true);
    expect(keychainItemExists(KEYCHAIN_SERVICE, fake(44))).toBe(false);
    expect(calls[0]).toEqual([
      'security',
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-w',
    ]);
    expect(calls[2]).not.toContain('-w');
  });

  it('requires every repo to name the loop Keychain item', () => {
    const cfg = fresh();
    cfg.schedule.repositories[0].keychain_service = 'other';
    expect(validateLoopConfig(cfg).join('\n')).toMatch(/keychain_service/);
  });
});
