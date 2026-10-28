#!/usr/bin/env node
/**
 * Shared-tooling health probe (launchd, every 5 min on the Mac).
 * Writes ~/.jovie/tooling-health/{latest.json,history.jsonl}; files/clears a
 * remediation P0 (Summer's red queue) after 2 consecutive reds when LINEAR_API_KEY
 * is available. Never prints secrets. Kill switch: touch ~/.jovie/tooling-health/disabled
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  fileRemediationSignal,
  resolveRemediationSignal,
} from './lib/remediation-signal.mjs';
import {
  alertAction,
  consecutiveRed,
  rollup,
  TOOLING_SCHEMA,
} from './lib/tooling-health.mjs';

const HOME = homedir();
const DIR =
  process.env.TOOLING_HEALTH_DIR ?? join(HOME, '.jovie', 'tooling-health');
mkdirSync(DIR, { recursive: true });
if (existsSync(join(DIR, 'disabled'))) process.exit(0);

const readJson = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};
const run = (cmd, args, { input, timeout = 20000 } = {}) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    input,
    timeout,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    ms: Date.now() - t0,
    status: r.status,
    out: r.stdout ?? '',
    err: r.stderr ?? '',
  };
};

const probes = {
  // Reads the existing 10-min search probe and 2x/day doctor snapshot: zero extra load.
  gbrain() {
    const p = readJson(join(HOME, '.gbrain/run/query-probe.json'));
    if (!p) return { ok: false, ms: 0, detail: 'query-probe.json missing' };
    const age = (Date.now() - Date.parse(p.at)) / 60000;
    const doc = readJson(join(HOME, '.gbrain/run/doctor-snapshot.json'));
    return {
      ok: p.status === 'ok' && age < 30,
      ms: p.search_ms ?? 0,
      detail: `search ${p.search_ms}ms (${p.status}), probe age ${Math.round(age)}m, doctor ${doc?.health_score ?? '?'}/100 failing=${(doc?.failing ?? []).join(',') || 'none'}`,
    };
  },
  // MCP initialize round trip through the same command Claude Code launches.
  'jovie-research-mcp'() {
    const init = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'tooling-health', version: '1' },
      },
    });
    const r = run(join(HOME, '.local/bin/jovie-research'), ['mcp'], {
      input: `${init}\n`,
      timeout: 25000,
    });
    const ok = /"result"/.test(r.out) && /"protocolVersion"/.test(r.out);
    return {
      ok,
      ms: r.ms,
      detail: ok
        ? 'initialize ok'
        : `no initialize result: ${r.err.slice(0, 120).replace(/\s+/g, ' ') || r.out.slice(0, 80)}`,
    };
  },
  // Router CLI health (gem, over ssh): the --version self-check.
  'jovie-research-cli'() {
    const r = run(join(HOME, '.local/bin/jovie-research'), ['sources'], {
      timeout: 30000,
    });
    return {
      ok: r.status === 0 && r.out.length > 0,
      ms: r.ms,
      detail: r.status === 0 ? 'sources ok' : `exit ${r.status}`,
    };
  },
  composio() {
    const r = run(join(HOME, '.composio/composio'), ['--version'], {
      timeout: 10000,
    });
    return { ok: r.status === 0, ms: r.ms, detail: `composio ${r.out.trim()}` };
  },
  // Hyperagent is consumed by the router on gem only; Mac token is not required.
  hyperagent: () => ({
    ok: true,
    ms: 0,
    detail: 'mac token not required (router runs on gem)',
    na: true,
  }),
  // ~/Jovie shared config: core.bare=true breaks git/hooks in every worktree.
  'jovie-checkout-bare'() {
    const r = run('git', [
      'config',
      '--file',
      join(HOME, 'Jovie/.git/config'),
      '--get',
      'core.bare',
    ]);
    const bare = r.out.trim() === 'true';
    return {
      ok: !bare,
      ms: r.ms,
      detail: bare
        ? 'core.bare=true in ~/Jovie/.git/config (worktrees need config --worktree core.bare false)'
        : 'core.bare unset/false',
    };
  },
};

const historyPath = join(DIR, 'history.jsonl');
let history = [];
try {
  history = readFileSync(historyPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l))
    .slice(-5000);
} catch {}
const previous = readJson(join(DIR, 'latest.json'))?.tools ?? {};
const at = new Date().toISOString();
const results = {};
for (const [tool, fn] of Object.entries(probes)) {
  let r;
  try {
    r = fn();
  } catch (e) {
    r = { ok: false, ms: 0, detail: `probe error: ${e.message}` };
  }
  results[tool] = r;
  if (!r.na) {
    const row = { at, tool, ok: r.ok, ms: r.ms };
    history.push(row);
    appendFileSync(historyPath, `${JSON.stringify(row)}\n`);
  }
}
const roll = rollup(history);
const tools = {};
for (const [tool, r] of Object.entries(results)) {
  const red = r.na ? 0 : consecutiveRed(history, tool);
  const action = alertAction({
    red,
    previousRed: previous[tool]?.consecutiveRed ?? 0,
  });
  tools[tool] = {
    ok: r.ok,
    na: !!r.na,
    detail: r.detail,
    ms: r.ms,
    consecutiveRed: red,
    ...roll[tool],
  };
  const apiKey = process.env.LINEAR_API_KEY;
  const ctx = {
    fingerprint: `tooling-health:${tool}`,
    source: 'scripts/tooling-health.mjs (mac launchd co.jovie.tooling-health)',
    runUrl: `file://${DIR}/latest.json`,
    detail: `${tool}: ${r.detail}. ${red} consecutive red probes. Owner and probe: canon/automation-registry.jsonl mac:tooling-health.`,
    apiKey,
  };
  if (action === 'red') {
    if (apiKey)
      tools[tool].alert = (await fileRemediationSignal(ctx)).action ?? 'filed';
    else {
      tools[tool].alert = 'no-linear-key';
      spawnSync('osascript', [
        '-e',
        `display notification "${tool} red x${red}" with title "tooling-health"`,
      ]);
    }
  } else if (action === 'green' && apiKey) {
    await resolveRemediationSignal(ctx);
    tools[tool].alert = 'resolved';
  }
}
const red = Object.entries(tools)
  .filter(([, t]) => !t.ok)
  .map(([k]) => k);
writeFileSync(
  join(DIR, 'latest.json'),
  `${JSON.stringify({ schema: TOOLING_SCHEMA, at, status: red.length ? 'degraded' : 'ok', red, tools }, null, 2)}\n`
);
console.log(
  JSON.stringify({ at, status: red.length ? 'degraded' : 'ok', red })
);
