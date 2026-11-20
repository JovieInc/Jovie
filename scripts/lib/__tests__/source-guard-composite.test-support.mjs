import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function expression(value, context) {
  const code = value
    .trim()
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/\.([\w]+-[\w-]+)/g, (_, key) => `[${JSON.stringify(key)}]`);
  // Only the checked-in workflow's property reads, comparisons and status functions.
  return Function(
    ...Object.keys(context),
    `return (${code});`
  )(...Object.values(context));
}

export function interpolate(value, context) {
  return String(value).replace(/\$\{\{([\s\S]*?)\}\}/g, (_, code) =>
    String(expression(code, context) ?? '')
  );
}

export function stepEnabled(step, context) {
  if (!step.if) return context.success();
  const explicitStatus = /\b(?:always|failure|success|cancelled)\s*\(/.test(
    step.if
  );
  return (explicitStatus || context.success()) && expression(step.if, context);
}

// The action and workflow steps in this fixture use single-line outputs.
export function stepOutputs(file) {
  const outputs = Object.create(null);
  if (file && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const split = line.indexOf('=');
      if (split > 0) outputs[line.slice(0, split)] = line.slice(split + 1);
    }
  }
  return new Proxy(outputs, { get: (target, key) => target[key] ?? '' });
}

export function runInstallAndStamp(f, action, inputs, outerContext, outerEnv) {
  const install = action.runs.steps.find(
    item => item.name === 'Install dependencies'
  );
  const stamp = action.runs.steps.find(
    item => item.name === 'Stamp installed workspace receipt'
  );
  assert.ok(install && stamp, 'use the normal installed-tree producer');
  assert.ok(
    action.runs.steps.indexOf(install) < action.runs.steps.indexOf(stamp)
  );
  const context = {
    ...outerContext,
    success: () => true,
    failure: () => false,
    github: { ...outerContext.github, event_name: 'pull_request' },
    inputs: {
      ...Object.fromEntries(
        Object.entries(action.inputs).map(([key, input]) => [
          key,
          input.default ?? '',
        ])
      ),
      ...inputs,
    },
    steps: {
      'runner-prereqs': { outputs: { dependencies_warm: 'false' } },
      'node-modules-cache': { outputs: { 'cache-hit': '' } },
    },
  };
  const directory = mkdtempSync(join(f.root, 'setup-step-'));
  const result = { status: 0, stdout: '', stderr: '' };
  for (const [index, child] of [install, stamp].entries()) {
    const output = join(directory, String(index));
    if (!stepEnabled(child, context)) {
      if (child.id)
        context.steps[child.id] = {
          outputs: stepOutputs(),
          outcome: 'skipped',
          conclusion: 'skipped',
        };
      continue;
    }
    writeFileSync(output, '');
    const env = Object.fromEntries(
      Object.entries(child.env ?? {}).map(([key, value]) => [
        key,
        interpolate(value, context),
      ])
    );
    const run = f.bash(
      `set -euo pipefail\n${interpolate(child.run, context)}`,
      { ...outerEnv, ...env, GITHUB_OUTPUT: output }
    );
    result.stdout += run.stdout ?? '';
    result.stderr += run.stderr ?? '';
    result.status = run.status;
    if (run.status !== 0) break;
    if (child.id)
      context.steps[child.id] = {
        outputs: stepOutputs(output),
        outcome: 'success',
        conclusion: 'success',
      };
  }
  return result;
}
