// Loads and validates the Summer improvement loop's Claude Managed Agents
// config (ops/agents/summer-improvement-loop/) and builds the scheduled
// deployment create body. Pure functions: no network, no secrets on disk.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
export const LOOP_DIR = resolve(
  here,
  '../../ops/agents/summer-improvement-loop'
);

export const KEYCHAIN_SERVICE = 'jovie-summer-loop-github';

// Reads a generic-password item from the macOS login Keychain. Returns null
// when the item is missing. The value is returned to the caller only; it is
// never printed or written anywhere.
export function readKeychainSecret(service, run = spawnSync) {
  const res = run('security', ['find-generic-password', '-s', service, '-w'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (res.status !== 0) return null;
  const value = String(res.stdout ?? '').replace(/\r?\n$/, '');
  return value || null;
}

// Returns true when the Keychain item exists, without reading its secret.
export function keychainItemExists(service, run = spawnSync) {
  const res = run('security', ['find-generic-password', '-s', service], {
    stdio: 'ignore',
  });
  return res.status === 0;
}

// Fills each repo's token_env from the environment, falling back to the
// repo's Keychain item, so the token never has to be typed into a shell.
export function resolveRepoTokens(cfg, env, readSecret = readKeychainSecret) {
  const out = { ...env };
  for (const repo of cfg.schedule.repositories ?? []) {
    if (out[repo.token_env]) continue;
    const value = repo.keychain_service
      ? readSecret(repo.keychain_service)
      : null;
    if (value) out[repo.token_env] = value;
  }
  return out;
}

export const ALLOWED_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
export const MAX_SESSION_CAP_CENTS = 100;
export const EXPECTED_REPOS = [
  'https://github.com/JovieInc/Jovie',
  'https://github.com/JovieInc/summer-config',
];
export const ALLOWED_HOSTS = new Set([
  'summer.jov.ie',
  'api.github.com',
  'gist.githubusercontent.com',
  'github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'api.linear.app',
]);
// Guardrail phrases the system prompt must keep. Removing one fails CI.
export const REQUIRED_PROMPT_GUARDRAILS = [
  'One PR per run',
  '--no-verify',
  'scripts/lanes/**',
  'No outbound messages to people',
  'No new spend',
  'credential',
  'regression test',
  'no-op',
  'receipt',
  'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
];
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-ant-[A-Za-z0-9_-]{10,}/,
  /lin_api_[A-Za-z0-9]{10,}/,
  /authorization_token\s*:/,
];

export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('agent.md must start with YAML frontmatter');
  return { config: loadYaml(match[1]), body: match[2].trim() };
}

export function loadLoopConfig(dir = LOOP_DIR) {
  const read = name => readFileSync(join(dir, name), 'utf8');
  const raw = {
    'agent.md': read('agent.md'),
    'environment.yaml': read('environment.yaml'),
    'memory_store-runs.yaml': read('memory_store-runs.yaml'),
    'schedule.yaml': read('schedule.yaml'),
  };
  const { config: agent, body: system } = parseFrontmatter(raw['agent.md']);
  return {
    raw,
    agent,
    system,
    environment: loadYaml(raw['environment.yaml']),
    memoryStore: loadYaml(raw['memory_store-runs.yaml']),
    schedule: loadYaml(raw['schedule.yaml']),
  };
}

// Upper bound on firings in a 31-day month for the simple cron shapes this
// loop allows: fixed minute, and an hour field of `*`, `*/N`, a number, or a
// comma list. Day/month/weekday fields must be `*` so the bound is exact.
export function maxRunsPerMonth(expression) {
  const fields = String(expression).trim().split(/\s+/);
  if (fields.length !== 5)
    throw new Error(`cron must have 5 fields: ${expression}`);
  const [minute, hour, dom, month, dow] = fields;
  if (!/^\d{1,2}$/.test(minute))
    throw new Error('cron minute must be a single fixed minute');
  if (dom !== '*' || month !== '*' || dow !== '*') {
    throw new Error('cron day-of-month, month and day-of-week must be *');
  }
  let perDay;
  if (hour === '*') perDay = 24;
  else if (/^\*\/\d+$/.test(hour)) {
    const step = Number(hour.slice(2));
    if (step < 1 || step > 23) throw new Error(`bad hour step: ${hour}`);
    perDay = Math.ceil(24 / step);
  } else if (/^\d{1,2}(,\d{1,2})*$/.test(hour)) {
    perDay = new Set(hour.split(',')).size;
  } else throw new Error(`unsupported cron hour field: ${hour}`);
  return perDay * 31;
}

export function worstCaseMonthlyUsd(schedule) {
  const capUsd = Number(schedule.budget.max_list_cost.amount) / 100;
  const overshoot = Number(schedule.budget_policy.overshoot_allowance_usd);
  const runs = maxRunsPerMonth(schedule.schedule.expression);
  return {
    runs,
    capUsd,
    perRunUsd: capUsd + overshoot,
    totalUsd: runs * (capUsd + overshoot),
  };
}

export function validateLoopConfig(cfg) {
  const errors = [];
  const err = msg => errors.push(msg);
  const { agent, system, environment, schedule } = cfg;

  // Agent
  const modelId =
    typeof agent.model === 'string' ? agent.model : agent.model?.id;
  if (!ALLOWED_MODELS.has(modelId))
    err(`agent model must be one of ${[...ALLOWED_MODELS]}: ${modelId}`);
  if (agent.mcp_servers?.length)
    err(
      'agent must not declare MCP servers (no credentials are approved for them)'
    );
  if (agent.multiagent)
    err('agent must not delegate (multiagent multiplies spend)');
  const toolset = (agent.tools ?? []).find(
    t => t.type === 'agent_toolset_20260401'
  );
  if (!toolset) err('agent must use agent_toolset_20260401');
  else {
    if (toolset.default_config?.permission_policy?.type !== 'auto') {
      err('agent toolset default permission policy must be auto');
    }
    for (const web of ['web_search', 'web_fetch']) {
      const entry = (toolset.configs ?? []).find(c => c.name === web);
      if (!entry || entry.enabled !== false)
        err(`${web} must be explicitly disabled`);
    }
  }
  const otherTools = (agent.tools ?? []).filter(
    t => t.type !== 'agent_toolset_20260401'
  );
  if (otherTools.length) err('agent must not declare custom or MCP tools');
  for (const phrase of REQUIRED_PROMPT_GUARDRAILS) {
    if (!system.includes(phrase))
      err(`system prompt lost guardrail: ${phrase}`);
  }

  // Environment
  const net = environment.config?.networking;
  if (environment.config?.type !== 'cloud')
    err('environment must be a cloud sandbox');
  if (net?.type !== 'limited') err('environment networking must be limited');
  for (const host of net?.allowed_hosts ?? []) {
    if (!ALLOWED_HOSTS.has(host)) err(`unexpected allowed host: ${host}`);
  }
  if (net?.allow_mcp_servers) err('allow_mcp_servers must be false');

  // Schedule and budget
  const budget = schedule.budget;
  if (budget?.type !== 'limit') err('deployment budget type must be limit');
  const amount = budget?.max_list_cost?.amount;
  if (typeof amount !== 'string' || !/^[1-9]\d*$/.test(amount)) {
    err('budget amount must be an integer string of cents');
  } else if (Number(amount) > MAX_SESSION_CAP_CENTS) {
    err(`per-session cap ${amount} cents exceeds ${MAX_SESSION_CAP_CENTS}`);
  }
  if (budget?.max_list_cost?.currency !== 'USD')
    err('budget currency must be USD');
  if (schedule.schedule?.type !== 'cron' || !schedule.schedule?.timezone) {
    err('schedule must be cron with a timezone');
  }
  try {
    const policy = schedule.budget_policy;
    const { totalUsd } = worstCaseMonthlyUsd(schedule);
    if (totalUsd > policy.monthly_ceiling_usd + 1e-9) {
      err(
        `worst case $${totalUsd.toFixed(2)}/month exceeds $${policy.monthly_ceiling_usd}`
      );
    }
    if (policy.credit_usd - policy.monthly_ceiling_usd < 50)
      err('must leave >= $50 headroom');
  } catch (e) {
    err(e.message);
  }
  const urls = (schedule.repositories ?? []).map(r => r.url).sort();
  if (JSON.stringify(urls) !== JSON.stringify([...EXPECTED_REPOS].sort())) {
    err(`repositories must be exactly ${EXPECTED_REPOS.join(', ')}`);
  }
  for (const repo of schedule.repositories ?? []) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(repo.token_env ?? ''))
      err(`repo ${repo.url} needs token_env`);
    if (repo.keychain_service !== KEYCHAIN_SERVICE)
      err(`repo ${repo.url} keychain_service must be ${KEYCHAIN_SERVICE}`);
  }
  const starts = schedule.initial_events ?? [];
  if (!starts.length || starts.some(e => e.type !== 'user.message')) {
    err('initial_events must be user.message events');
  }

  // No secrets in any committed file
  for (const [name, text] of Object.entries(cfg.raw)) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text))
        err(`${name} looks like it contains a secret (${pattern})`);
    }
  }
  return errors;
}

// Build the POST /v1/deployments body. Tokens come from `env` at deploy time
// and are never written to disk.
export function buildDeploymentBody(
  cfg,
  { agentId, environmentId, memoryStoreId, env = {} }
) {
  for (const [label, value, prefix] of [
    ['agentId', agentId, 'agent_'],
    ['environmentId', environmentId, 'env_'],
    ['memoryStoreId', memoryStoreId, 'memstore_'],
  ]) {
    if (!String(value ?? '').startsWith(prefix))
      throw new Error(`${label} must start with ${prefix}`);
  }
  const s = cfg.schedule;
  const resources = s.repositories.map(repo => {
    const token = env[repo.token_env];
    if (!token)
      throw new Error(
        `${repo.token_env} is not set and Keychain item ${repo.keychain_service ?? '(none)'} was not found`
      );
    return {
      type: 'github_repository',
      url: repo.url,
      mount_path: repo.mount_path,
      authorization_token: token,
    };
  });
  resources.push({
    type: 'memory_store',
    memory_store_id: memoryStoreId,
    access: s.memory_store.access,
    instructions: s.memory_store.instructions,
  });
  return {
    name: s.name,
    description: s.description,
    agent: agentId,
    environment_id: environmentId,
    resources,
    schedule: s.schedule,
    budget: s.budget,
    initial_events: s.initial_events,
    metadata: { repo_path: 'ops/agents/summer-improvement-loop' },
  };
}

export function redactBody(body) {
  return {
    ...body,
    resources: body.resources.map(r =>
      r.authorization_token ? { ...r, authorization_token: '<redacted>' } : r
    ),
  };
}
