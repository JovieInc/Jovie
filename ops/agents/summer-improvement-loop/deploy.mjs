#!/usr/bin/env node
// Operate the Summer improvement loop's Claude Managed Agents deployment.
// Needs the `ant` CLI logged in to Tim's Claude Platform org (`ant auth login`).
//
//   node ops/agents/summer-improvement-loop/deploy.mjs validate   # offline config check
//   node ops/agents/summer-improvement-loop/deploy.mjs plan       # ant apply --dry-run
//   node ops/agents/summer-improvement-loop/deploy.mjs apply      # sync agent/env/memory (asks y/n)
//   LOOP_GITHUB_TOKEN=... node .../deploy.mjs create              # create the scheduled deployment
//   node .../deploy.mjs run | pause | unpause | status
//
// Kill switch: `deploy.mjs pause` (or `ant beta:deployments pause --deployment-id <id>`)
// stops scheduled firings; running sessions finish under their own budget cap.
// The deployment id is stored in deployment-lock.json beside this file.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDeploymentBody,
  LOOP_DIR,
  loadLoopConfig,
  redactBody,
  validateLoopConfig,
  worstCaseMonthlyUsd,
} from '../../../scripts/lib/summer-improvement-loop-config.mjs';

const LOCK = join(LOOP_DIR, 'claude-lock.json');
const DEPLOYMENT_LOCK = join(LOOP_DIR, 'deployment-lock.json');
const APPLY_FILES = ['agent.md', 'environment.yaml', 'memory_store-runs.yaml'];

function ant(args, { input, inherit = false } = {}) {
  const res = spawnSync('ant', args, {
    cwd: LOOP_DIR,
    input,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    throw new Error(
      `ant ${args[0]} ${args[1] ?? ''} failed: ${(res.stderr || res.stdout || '').trim()}`
    );
  }
  return inherit ? '' : res.stdout;
}
const antJson = (args, opts) =>
  JSON.parse(ant([...args, '--format', 'json'], opts));

function lockedId(file) {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const entry = Object.entries(lock.resources ?? {}).find(([path]) =>
    path.endsWith(file)
  );
  if (!entry)
    throw new Error(`${file} not in claude-lock.json; run apply first`);
  return entry[1].id;
}
function deploymentId() {
  if (!existsSync(DEPLOYMENT_LOCK))
    throw new Error('no deployment-lock.json; run create first');
  return JSON.parse(readFileSync(DEPLOYMENT_LOCK, 'utf8')).deployment_id;
}

function validate() {
  const cfg = loadLoopConfig();
  const errors = validateLoopConfig(cfg);
  if (errors.length)
    throw new Error(`config invalid:\n- ${errors.join('\n- ')}`);
  const cost = worstCaseMonthlyUsd(cfg.schedule);
  process.stdout.write(
    `config ok: ${cost.runs} runs/month max x $${cost.perRunUsd.toFixed(2)} = $${cost.totalUsd.toFixed(2)} worst case\n`
  );
  return cfg;
}

const commands = {
  validate,
  plan() {
    validate();
    ant(['apply', '--dry-run', '-v', '--lock-file', LOCK, ...APPLY_FILES], {
      inherit: true,
    });
  },
  apply() {
    validate();
    // Interactive: ant prints the plan and asks before changing anything.
    ant(['apply', '--lock-file', LOCK, ...APPLY_FILES], { inherit: true });
  },
  create() {
    const cfg = validate();
    if (existsSync(DEPLOYMENT_LOCK))
      throw new Error(`deployment exists: ${deploymentId()}`);
    const body = buildDeploymentBody(cfg, {
      agentId: lockedId('agent.md'),
      environmentId: lockedId('environment.yaml'),
      memoryStoreId: lockedId('memory_store-runs.yaml'),
      env: process.env,
    });
    process.stdout.write(`${JSON.stringify(redactBody(body), null, 2)}\n`);
    // Body (with tokens) goes over stdin only; never argv, never disk.
    const created = antJson(['beta:deployments', 'create'], {
      input: JSON.stringify(body),
    });
    writeFileSync(
      DEPLOYMENT_LOCK,
      `${JSON.stringify({ deployment_id: created.id, created_at: created.created_at }, null, 2)}\n`
    );
    process.stdout.write(
      `created ${created.id}; next runs ${JSON.stringify(created.schedule?.upcoming_runs_at ?? [])}\n`
    );
  },
  run() {
    const run = antJson([
      'beta:deployments',
      'run',
      '--deployment-id',
      deploymentId(),
    ]);
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  },
  pause() {
    ant(['beta:deployments', 'pause', '--deployment-id', deploymentId()], {
      inherit: true,
    });
  },
  unpause() {
    ant(['beta:deployments', 'unpause', '--deployment-id', deploymentId()], {
      inherit: true,
    });
  },
  status() {
    const id = deploymentId();
    const d = antJson(['beta:deployments', 'retrieve', '--deployment-id', id]);
    process.stdout.write(
      `${id} status=${d.status} paused=${JSON.stringify(d.paused_reason)}\n`
    );
    const runs = ant([
      'beta:deployment-runs',
      'list',
      '--deployment-id',
      id,
      '--max-items',
      '20',
      '--format',
      'jsonl',
      '--transform',
      '{id,created_at,session_id,error,trigger_context}',
    ])
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    let total = 0;
    for (const run of runs) {
      if (!run.session_id) {
        process.stdout.write(
          `${run.created_at} ${run.id} error=${run.error?.type}\n`
        );
        continue;
      }
      const s = antJson([
        'beta:sessions',
        'retrieve',
        '--session-id',
        run.session_id,
      ]);
      const cents = Number(s.usage?.list_cost?.amount ?? 0);
      total += cents;
      process.stdout.write(
        `${run.created_at} ${run.session_id} ${s.status} stop=${s.stop_reason?.type ?? '-'} $${(cents / 100).toFixed(2)}\n`
      );
    }
    process.stdout.write(
      `listed sessions list cost: $${(total / 100).toFixed(2)}\n`
    );
  },
};

const cmd = process.argv[2];
if (!commands[cmd]) {
  process.stderr.write(
    `usage: deploy.mjs ${Object.keys(commands).join('|')}\n`
  );
  process.exit(2);
}
try {
  commands[cmd]();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
