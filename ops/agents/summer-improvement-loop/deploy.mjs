#!/usr/bin/env node
// Operate the Summer improvement loop's Claude Managed Agents deployment.
// Needs the `ant` CLI logged in to Tim's Claude Platform org (`ant auth login`).
//
//   node ops/agents/summer-improvement-loop/deploy.mjs validate   # offline config check
//   node ops/agents/summer-improvement-loop/deploy.mjs plan       # ant apply --dry-run
//   node ops/agents/summer-improvement-loop/deploy.mjs apply      # sync agent/env/memory (asks y/n)
//   node .../deploy.mjs create                                    # create the scheduled deployment
//
// create reads the GitHub token from $LOOP_GITHUB_TOKEN, or when unset from the
// macOS Keychain item `jovie-summer-loop-github`. Store it once, with hidden
// input, so it never appears in a terminal:
//   security add-generic-password -a jovie -s jovie-summer-loop-github -w
//   node .../deploy.mjs ready | pin | run | pause | unpause | status
//   (run `pin` after every `apply` that changes agent.md)
//
// Kill switch: `deploy.mjs pause` (or `ant beta:deployments pause --deployment-id <id>`)
// stops scheduled firings; running sessions finish under their own budget cap.
// The deployment id is stored in deployment-lock.json beside this file.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDeploymentBody,
  KEYCHAIN_SERVICE,
  keychainItemExists,
  LOOP_DIR,
  loadLoopConfig,
  redactBody,
  resolveRepoTokens,
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
    // `apply --yes` applies the plan without the prompt (approved runs only).
    const yes = process.argv.includes('--yes') ? ['--yes'] : [];
    ant(['apply', '--lock-file', LOCK, ...yes, ...APPLY_FILES], {
      inherit: true,
    });
  },
  ready() {
    // Prerequisites for create, checked without reading any secret.
    const auth = spawnSync('ant', ['beta:agents', 'list', '--max-items', '1'], {
      stdio: 'ignore',
    });
    const loggedIn = auth.status === 0;
    const token =
      Boolean(process.env.LOOP_GITHUB_TOKEN) ||
      keychainItemExists(KEYCHAIN_SERVICE);
    process.stdout.write(
      `ant-authenticated=${loggedIn} github-token=${token}\n`
    );
    if (!loggedIn || !token) process.exitCode = 1;
  },
  create() {
    const cfg = validate();
    if (existsSync(DEPLOYMENT_LOCK))
      throw new Error(`deployment exists: ${deploymentId()}`);
    const body = buildDeploymentBody(cfg, {
      agentId: lockedId('agent.md'),
      environmentId: lockedId('environment.yaml'),
      memoryStoreId: lockedId('memory_store-runs.yaml'),
      env: resolveRepoTokens(cfg, process.env),
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
  pin() {
    // Deployments pin the agent version they were created with; after `apply`
    // changes the agent, move the deployment to the latest version.
    const agentId = lockedId('agent.md');
    const { version } = antJson([
      'beta:agents',
      'retrieve',
      '--agent-id',
      agentId,
    ]);
    const updated = antJson(
      ['beta:deployments', 'update', '--deployment-id', deploymentId()],
      {
        input: JSON.stringify({
          agent: { type: 'agent', id: agentId, version },
        }),
      }
    );
    process.stdout.write(
      `${updated.id} now runs ${agentId} v${updated.agent?.version}\n`
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
  review() {
    // Everything a run review needs: the latest (or given) session's status,
    // cost and duration, its tool calls and messages, and the memory store.
    const sessionId =
      process.argv[3] ??
      ant([
        'beta:deployment-runs',
        'list',
        '--deployment-id',
        deploymentId(),
        '--max-items',
        '1',
        '--transform',
        'session_id',
        '-r',
      ]).trim();
    const s = antJson(['beta:sessions', 'retrieve', '--session-id', sessionId]);
    const cents = Number(s.usage?.list_cost?.amount ?? 0);
    process.stdout.write(
      `# ${sessionId} ${s.status} created=${s.created_at} updated=${s.updated_at} ` +
        `active=${s.usage?.active_seconds}s cost=$${(cents / 100).toFixed(2)}/$1.00 ` +
        `in=${s.usage?.input_tokens} cache_read=${s.usage?.cache_read_input_tokens} out=${s.usage?.output_tokens}\n`
    );
    const events = ant([
      'beta:sessions:events',
      'list',
      '--session-id',
      sessionId,
      '--format',
      'jsonl',
      '--transform',
      '{type,name,cmd:input.command,text:content.#(type=="text").text,err:error.message,perm:evaluated_permission}',
    ])
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    for (const e of events) {
      if (e.type === 'agent.tool_use') {
        process.stdout.write(
          `TOOL ${e.name} [${e.perm}] ${(e.cmd ?? '').slice(0, 300)}\n`
        );
      } else if (e.type === 'agent.tool_result') {
        process.stdout.write(
          `  -> ${(e.text ?? '').slice(0, 300).replaceAll('\n', ' | ')}\n`
        );
      } else if (e.type === 'agent.message') {
        process.stdout.write(`MSG ${e.text}\n`);
      } else if (e.type === 'session.error' || e.err) {
        process.stdout.write(`ERROR ${e.type} ${e.err}\n`);
      }
    }
    const storeId = lockedId('memory_store-runs.yaml');
    const memories = ant([
      'beta:memory-stores:memories',
      'list',
      '--memory-store-id',
      storeId,
      '--format',
      'jsonl',
      '--transform',
      '{id,path}',
    ])
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    for (const m of memories) {
      const full = antJson([
        'beta:memory-stores:memories',
        'retrieve',
        '--memory-store-id',
        storeId,
        '--memory-id',
        m.id,
      ]);
      process.stdout.write(`\n## memory ${m.path}\n${full.content ?? ''}\n`);
    }
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
