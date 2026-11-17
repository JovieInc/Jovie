/**
 * Merge-queue parity (audit finding 2, .github/MERGE_QUEUE.md "Queue parity").
 *
 * The queue is a re-check, not a first check. Two rules, enforced by
 * scripts/ci-workflow-topology.test.mjs against .github/merge-queue-parity.json:
 *
 *   1. Every job the queue requires (the jobs behind a required context on
 *      merge_group, with their transitive `needs`) has a job required on
 *      pull_request that runs the same command, or a dated exemption saying
 *      why its result can only be known on the combined head.
 *   2. A job whose inputs are only the PR (diff size, body, labels) does not
 *      run on merge_group, unless it carries a dated exemption.
 *
 * Exemption expiry reads a commit-derived clock: the newest `createdOn` in the
 * policy, so the same commit gets the same verdict whatever the day (hermetic
 * CI contract). Adding a new exemption therefore fails on any older one that
 * has lapsed. CALENDAR_DEADLINE_SCAN=1 (the daily time-bomb scan) reads the
 * real clock instead, as apps/web/tests/utils/calendar-deadline-clock.ts does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as yamlLoad } from 'js-yaml';

export const POLICY_PATH = '.github/merge-queue-parity.json';
export const RULESET_PATH = '.github/rulesets/branch-protection.yml';
export const MAX_EXEMPTION_DAYS = 90;
const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- `if:` eval
// Three-valued evaluation of a GitHub `if:` for one event: true, false or
// null (unknown). A job "may run" on an event unless its `if:` is false.

function tokenize(src) {
  const tokens = [];
  const re =
    /\s*(?:(&&|\|\||==|!=|<=|>=|[!()<>,])|'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?)|([A-Za-z_][\w.\-*]*(?:\[[^\]]*\])*))/y;
  let match;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(re.lastIndex))) break;
    match = re.exec(src);
    if (!match)
      throw new Error(
        `cannot parse expression near: ${src.slice(re.lastIndex, re.lastIndex + 30)}`
      );
    if (match[1]) tokens.push({ op: match[1] });
    else if (match[2] !== undefined)
      tokens.push({ str: match[2].replace(/''/g, "'") });
    else if (match[3]) tokens.push({ num: match[3] });
    else tokens.push({ id: match[4] });
  }
  return tokens;
}

/** @returns {boolean|null} */
export function evaluateIf(expression, event) {
  if (expression === undefined || expression === null || expression === '')
    return true;
  if (typeof expression === 'boolean') return expression;
  const src = String(expression)
    .trim()
    .replace(/^\$\{\{([\s\S]*)\}\}$/, '$1');
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = op => peek()?.op === op;
  const value = node => (node.kind === 'bool' ? node.v : null);
  const and = (a, b) =>
    a === false || b === false ? false : a === true && b === true ? true : null;
  const or = (a, b) =>
    a === true || b === true ? true : a === false && b === false ? false : null;

  function primary() {
    const t = tokens[pos++];
    if (!t) throw new Error('unexpected end of expression');
    if (t.op === '!') {
      const v = value(primary());
      return { kind: 'bool', v: v === null ? null : !v };
    }
    if (t.op === '(') {
      const inner = orExpr();
      if (!isOp(')')) throw new Error('missing )');
      pos++;
      return inner;
    }
    if (t.str !== undefined) return { kind: 'lit', v: t.str };
    if (t.num !== undefined) return { kind: 'lit', v: Number(t.num) };
    if (t.id) {
      if (isOp('(')) {
        pos++;
        let depth = 1;
        while (depth > 0 && pos < tokens.length) {
          if (tokens[pos].op === '(') depth++;
          if (tokens[pos].op === ')') depth--;
          pos++;
        }
        if (t.id === 'always') return { kind: 'bool', v: true };
        if (t.id === 'cancelled') return { kind: 'bool', v: false };
        return { kind: 'bool', v: null };
      }
      if (t.id === 'true' || t.id === 'false')
        return { kind: 'bool', v: t.id === 'true' };
      if (t.id === 'github.event_name') return { kind: 'lit', v: event };
      return { kind: 'unknown' };
    }
    throw new Error(`unexpected token ${JSON.stringify(t)}`);
  }
  function comparison() {
    const left = primary();
    const op = peek()?.op;
    if (!['==', '!=', '<', '>', '<=', '>='].includes(op)) {
      return left.kind === 'bool' ? left : { kind: 'bool', v: null };
    }
    pos++;
    const right = primary();
    if (
      (op === '==' || op === '!=') &&
      left.kind === 'lit' &&
      right.kind === 'lit'
    ) {
      const equal = left.v === right.v;
      return { kind: 'bool', v: op === '==' ? equal : !equal };
    }
    return { kind: 'bool', v: null };
  }
  function andExpr() {
    let v = value(comparison());
    while (isOp('&&')) {
      pos++;
      v = and(v, value(comparison()));
    }
    return { kind: 'bool', v };
  }
  function orExpr() {
    let v = value(andExpr());
    while (isOp('||')) {
      pos++;
      v = or(v, value(andExpr()));
    }
    return { kind: 'bool', v };
  }
  const result = orExpr();
  if (pos !== tokens.length) throw new Error(`trailing tokens in: ${src}`);
  return result.v;
}

/** Job display name as GitHub resolves it for `event`. */
export function jobName(job, id, event) {
  const raw = job?.name ?? id;
  const m = String(raw).match(
    /^\$\{\{\s*github\.event_name\s*==\s*'([\w-]+)'\s*&&\s*'([^']*)'\s*\|\|\s*'([^']*)'\s*\}\}$/
  );
  if (!m) return String(raw);
  return m[1] === event ? m[2] : m[3];
}

function triggers(workflow) {
  // js-yaml keeps `on` as a string key (YAML 1.2); a YAML 1.1 parser would make it `true`.
  const on = workflow?.on ?? workflow?.['true'];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on;
  return Object.keys(on ?? {});
}

/** @returns {Map<string, object>} file -> parsed workflow */
export function loadWorkflows(root = process.cwd()) {
  const dir = join(root, '.github/workflows');
  const workflows = new Map();
  for (const file of readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(file)) continue;
    workflows.set(file, yamlLoad(readFileSync(join(dir, file), 'utf8')));
  }
  return workflows;
}

export function requiredContexts(root = process.cwd()) {
  const ruleset =
    /** @type {{ rules: Array<{ type: string, parameters: { required_status_checks: Array<{ context: string }> } }> }} */ (
      yamlLoad(readFileSync(join(root, RULESET_PATH), 'utf8'))
    );
  const rule = ruleset.rules.find(r => r.type === 'required_status_checks');
  return rule.parameters.required_status_checks.map(c => c.context);
}

const needsOf = job => (job?.needs === undefined ? [] : [].concat(job.needs));
const mayRun = (job, event) => evaluateIf(job?.if, event) !== false;

/**
 * Jobs that run on `event` and are required there: every job whose resolved
 * name is a required context, or that a status producer names, plus the
 * transitive `needs` that may run on that event.
 * @returns {{ jobs: Map<string, {file: string, id: string, job: object}>, producers: Map<string, string[]> }}
 */
export function requiredJobs(workflows, contexts, event, statusProducers = {}) {
  const jobs = new Map();
  const producers = new Map(contexts.map(c => [c, []]));
  const visit = (file, id) => {
    const key = `${file}#${id}`;
    const job = workflows.get(file)?.jobs?.[id];
    if (!job) throw new Error(`${key} does not exist`);
    if (jobs.has(key) || !mayRun(job, event)) return;
    jobs.set(key, { file, id, job });
    for (const need of needsOf(job)) visit(file, need);
  };
  for (const [file, workflow] of workflows) {
    if (!triggers(workflow).includes(event)) continue;
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      const name = jobName(job, id, event);
      if (!producers.has(name) || !mayRun(job, event)) continue;
      producers.get(name).push(`${file}#${id}`);
      visit(file, id);
    }
  }
  for (const [context, byEvent] of Object.entries(statusProducers)) {
    for (const key of [].concat(byEvent?.[event] ?? [])) {
      const [file, id] = key.split('#');
      producers.get(context)?.push(key);
      visit(file, id);
    }
  }
  return { jobs, producers };
}

/** Every job that may run on `event`, required or not. */
export function jobsOn(workflows, event) {
  const out = new Map();
  for (const [file, workflow] of workflows) {
    if (!triggers(workflow).includes(event)) continue;
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      if (mayRun(job, event)) out.set(`${file}#${id}`, { file, id, job });
    }
  }
  return out;
}

const squash = text => String(text).replace(/\s+/g, ' ').trim();

/** Every string in the job (run, uses, with, env), raw and whitespace-squashed, so quotes and backslashes match as written. */
const jobText = job => {
  const parts = [];
  const walk = value => {
    if (typeof value === 'string') parts.push(value);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(walk);
  };
  walk(job);
  return squash(parts.join(' '));
};

const dayOf = value =>
  DATE.test(value ?? '') ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;

/** Clock for exemption expiry: commit-derived unless the time-bomb scan asks. */
export function parityClock(policy, env = process.env) {
  if (env.CALENDAR_DEADLINE_SCAN === '1') return new Date();
  const created = [
    ...(policy.exemptions ?? []),
    ...(policy.prOnlyExemptions ?? []),
  ]
    .map(e => dayOf(e.createdOn))
    .filter(Number.isFinite);
  return new Date(created.length ? Math.max(...created) : 0);
}

function exemptionErrors(list, label, asOf) {
  const errors = [];
  const seen = new Set();
  for (const item of list ?? []) {
    const prefix = `${label} ${item?.job ?? '<missing job>'}`;
    if (seen.has(item?.job)) errors.push(`${prefix}: listed twice`);
    seen.add(item?.job);
    if (typeof item?.reason !== 'string' || item.reason.trim().length < 40)
      errors.push(
        `${prefix}: reason must say, in at least 40 characters, why the result can only be known on the combined head`
      );
    const start = dayOf(item?.createdOn);
    const end = dayOf(item?.expiresOn);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errors.push(`${prefix}: createdOn and expiresOn must be YYYY-MM-DD`);
      continue;
    }
    const days = (end - start) / DAY_MS;
    if (days < 0 || days > MAX_EXEMPTION_DAYS)
      errors.push(
        `${prefix}: exemption lifetime must be 0 to ${MAX_EXEMPTION_DAYS} days`
      );
    if (end + DAY_MS <= asOf.getTime())
      errors.push(
        `${prefix}: exemption expired on ${item.expiresOn}; close the gap or renew it with a new reason`
      );
  }
  return errors;
}

/**
 * @param {{ workflows: Map<string, object>, contexts: string[], policy: object, asOf?: Date }} input
 * @returns {{ errors: string[], queueRequired: string[], prRequired: string[] }}
 */
export function validateQueueParity({
  workflows,
  contexts,
  policy,
  asOf = parityClock(policy),
}) {
  const errors = [];
  const queue = requiredJobs(
    workflows,
    contexts,
    'merge_group',
    policy.statusProducers
  );
  const pr = requiredJobs(
    workflows,
    contexts,
    'pull_request',
    policy.statusProducers
  );
  for (const context of contexts) {
    for (const [event, side] of /** @type {const} */ ([
      ['pull_request', pr],
      ['merge_group', queue],
    ])) {
      if (side.producers.get(context).length === 0)
        errors.push(
          `required context "${context}" has no producing job on ${event}`
        );
    }
  }

  const parity = policy.parity ?? {};
  const exempt = new Map((policy.exemptions ?? []).map(e => [e.job, e]));
  const prOnly = new Map((policy.prOnlyInputs ?? []).map(e => [e.job, e]));
  for (const key of queue.jobs.keys()) {
    // The same job required on both events runs the same command by construction.
    // A PR-only job is judged by the reverse rule below instead.
    if (pr.jobs.has(key) || prOnly.has(key)) continue;
    const match = parity[key];
    if (match && exempt.has(key))
      errors.push(`${key}: has both a PR match and an exemption; keep one`);
    if (!match && !exempt.has(key)) {
      errors.push(
        `${key}: required on merge_group with no matching required pull_request job; add it to "parity" in ${POLICY_PATH} or exempt it with a dated reason`
      );
      continue;
    }
    if (!match) continue;
    const counterpart = pr.jobs.get(match.pr);
    if (!counterpart) {
      errors.push(
        `${key}: parity job ${match.pr} is not required on pull_request`
      );
      continue;
    }
    if (typeof match.command !== 'string' || match.command.trim() === '') {
      errors.push(`${key}: parity entry needs the shared "command"`);
      continue;
    }
    for (const [side, job] of [
      [key, queue.jobs.get(key).job],
      [match.pr, counterpart.job],
    ]) {
      if (!jobText(job).includes(squash(match.command)))
        errors.push(
          `${key}: shared command "${match.command}" is not in ${side}`
        );
    }
  }
  for (const key of Object.keys(parity)) {
    if (!queue.jobs.has(key))
      errors.push(`${key}: stale parity entry, not required on merge_group`);
  }
  for (const [key, item] of exempt) {
    if (!queue.jobs.has(key))
      errors.push(
        `${key}: stale exemption, not required on merge_group; delete it`
      );
    else if (pr.jobs.has(key) || prOnly.has(key))
      errors.push(`${key}: exemption is not needed; delete it`);
    if (!['combined-head', 'gap'].includes(item.kind))
      errors.push(
        `${key}: exemption kind must be "combined-head" (only the combined head can answer) or "gap" (a PR job should run it)`
      );
  }
  errors.push(...exemptionErrors(policy.exemptions, 'exemption', asOf));

  // Reverse rule: PR-only inputs never run on merge_group.
  const onQueue = jobsOn(workflows, 'merge_group');
  const prOnlyExempt = new Map(
    (policy.prOnlyExemptions ?? []).map(e => [e.job, e])
  );
  for (const [key, item] of prOnly) {
    const [file, id] = key.split('#');
    if (!workflows.get(file)?.jobs?.[id]) {
      errors.push(`${key}: listed in prOnlyInputs but does not exist`);
      continue;
    }
    if (typeof item.why !== 'string' || item.why.trim().length < 20)
      errors.push(
        `${key}: prOnlyInputs entry needs a "why" naming the PR-only input`
      );
    if (item.pr && !pr.jobs.has(item.pr))
      errors.push(
        `${key}: its PR check ${item.pr} must stay required on pull_request`
      );
    if (onQueue.has(key) && !prOnlyExempt.has(key))
      errors.push(
        `${key}: reads only the PR (diff, body, labels or approvals) but runs on merge_group; keep it required on pull_request and drop it from the queue`
      );
    if (!onQueue.has(key) && prOnlyExempt.has(key))
      errors.push(
        `${key}: no longer runs on merge_group; delete its prOnlyExemptions entry`
      );
  }
  for (const key of prOnlyExempt.keys()) {
    if (!prOnly.has(key))
      errors.push(`${key}: prOnlyExemptions entry is not in prOnlyInputs`);
  }
  errors.push(
    ...exemptionErrors(policy.prOnlyExemptions, 'PR-only exemption', asOf)
  );

  return {
    errors,
    queueRequired: [...queue.jobs.keys()].sort(),
    prRequired: [...pr.jobs.keys()].sort(),
  };
}

export function loadPolicy(root = process.cwd()) {
  return JSON.parse(readFileSync(join(root, POLICY_PATH), 'utf8'));
}
