import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { evaluateIf } from '../lib/queue-parity.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');

// Reuse the required-check parity evaluator; unknown path inputs stay unknown.
export function eventCondition(source, event = 'merge_group') {
  return evaluateIf(source, event);
}

export function mergeGroupJobs(workflow) {
  if (!workflow.on?.merge_group) {
    // YAML's empty merge_group mapping is null, still a declared trigger.
    if (!Object.hasOwn(workflow.on ?? {}, 'merge_group'))
      throw new Error('CI has no merge_group trigger');
  }
  return Object.entries(workflow.jobs)
    .filter(([, job]) => eventCondition(job.if) !== false)
    .map(([id]) => id);
}

function commandInStep(job, name, command, event) {
  const step = job.steps?.find(candidate => candidate.name === name);
  if (!step || eventCondition(step.if, event) === false) return false;
  return (
    typeof step.run === 'string' &&
    step.run.split('\n').some(line => line.trim() === command)
  );
}

export function validateMqParity(manifest, workflow, readWorkflow) {
  const errors = [];
  const mqJobs = mergeGroupJobs(workflow);
  const entries = manifest.jobs ?? {};
  for (const id of mqJobs) {
    const entry = entries[id];
    if (!entry) {
      errors.push(`${id}: missing from MQ parity manifest`);
      continue;
    }
    if (Boolean(entry.twins?.length) === Boolean(entry.needs_merged_tree)) {
      errors.push(`${id}: declare twins OR needs_merged_tree`);
      continue;
    }
    for (const twin of entry.twins ?? []) {
      try {
        const target = readWorkflow(twin.workflow);
        const job = target.jobs?.[twin.job];
        if (!job)
          throw new Error(`missing twin job ${twin.workflow}#${twin.job}`);
        const prEvents = ['pull_request', 'pull_request_target'].filter(event =>
          Object.hasOwn(target.on ?? {}, event)
        );
        if (!prEvents.some(event => eventCondition(job.if, event) !== false))
          throw new Error('twin has no reachable PR trigger');
        if (job['continue-on-error'])
          throw new Error('twin cannot continue on error');
        if (
          !commandInStep(
            workflow.jobs[id],
            twin.mq_step,
            twin.command,
            'merge_group'
          )
        )
          throw new Error(`MQ command missing: ${twin.command}`);
        if (!commandInStep(job, twin.pr_step, twin.command, 'pull_request'))
          throw new Error(`PR twin command missing: ${twin.command}`);
        const prStep = job.steps.find(step => step.name === twin.pr_step);
        if (prStep['continue-on-error'])
          throw new Error('twin step cannot continue on error');
        for (const [key, value] of Object.entries(twin.env ?? {})) {
          const mqStep = workflow.jobs[id].steps.find(
            step => step.name === twin.mq_step
          );
          if (
            String(prStep.env?.[key] ?? job.env?.[key]) !== value ||
            String(mqStep.env?.[key] ?? workflow.jobs[id].env?.[key]) !== value
          )
            throw new Error(`twin selector drift: ${key}`);
        }
      } catch (error) {
        errors.push(`${id}: ${error.message}`);
      }
    }
    if (entry.needs_merged_tree) {
      const { reason, inputs } = entry.needs_merged_tree;
      if (typeof reason !== 'string' || !inputs?.length)
        errors.push(`${id}: needs_merged_tree must name a concrete input`);
      for (const input of inputs ?? []) {
        const lane = /^needs\.([\w-]+)\.(?:result|outputs\.[\w-]+)$/.exec(
          input
        );
        const valid =
          /^github\.event\.merge_group\.(?:base_sha|head_sha|head_ref)$/.test(
            input
          ) ||
          (lane &&
            workflow.jobs[lane[1]] &&
            (workflow.jobs[id].needs ?? []).includes(lane[1]));
        if (!valid || !reason?.includes(input))
          errors.push(
            `${id}: needs_merged_tree reason must name input ${input}`
          );
      }
      for (const lane of entry.rollup_lanes ?? []) {
        if (
          !mqJobs.includes(lane) ||
          !(workflow.jobs[id].needs ?? []).includes(lane)
        )
          errors.push(`${id}: missing underlying rollup lane ${lane}`);
      }
    }
  }
  for (const id of Object.keys(entries))
    if (!mqJobs.includes(id))
      errors.push(`${id}: stale or non-MQ manifest job`);
  return errors;
}

export function validateRepositoryMqParity(root) {
  const readWorkflow = path => {
    const resolved = resolve(root, path);
    if (
      relative(root, resolved).startsWith('..') ||
      !/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(path)
    )
      throw new Error(`Invalid workflow reference: ${path}`);
    return load(readFileSync(resolved, 'utf8'));
  };
  return validateMqParity(
    JSON.parse(
      readFileSync(resolve(root, 'scripts/ci/mq-parity-manifest.json'), 'utf8')
    ),
    readWorkflow('.github/workflows/ci.yml'),
    readWorkflow
  );
}
