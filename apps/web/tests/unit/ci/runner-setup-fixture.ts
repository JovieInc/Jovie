import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

// JOV-7707: the setup action is checked from its parsed YAML. Step `if:`
// expressions are evaluated for each event, and the prune shell runs against
// a fixture .pnpm tree.
export type ActionStep = {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
export const setupAction = parseYaml(
  readFileSync(
    resolve(repoRoot, '.github/actions/setup-node-pnpm/action.yml'),
    'utf8'
  )
) as {
  inputs: Record<string, { default?: string }>;
  runs: { steps: ActionStep[] };
};
export const actionSteps = setupAction.runs.steps;
export const actionStep = (name: string) => {
  const found = actionSteps.find(step => step.name === name);
  if (!found) throw new Error(`Missing setup action step: ${name}`);
  return found;
};
export const stepIndex = (name: string) =>
  actionSteps.findIndex(step => step.name === name);

// Minimal GitHub Actions expression evaluator: literals, context paths,
// ==, !=, !, &&, || and parentheses (all the setup action uses).
export function evaluateCondition(
  expression: string | undefined,
  context: Record<string, string>
): boolean {
  if (!expression) return true;
  const tokens =
    expression
      .replace(/^\$\{\{|\}\}$/g, '')
      .match(/'[^']*'|==|!=|&&|\|\||!|\(|\)|[A-Za-z_][\w.-]*/g) ?? [];
  const source = tokens
    .map(token => {
      if (token.startsWith("'")) return JSON.stringify(token.slice(1, -1));
      if (token === '==') return '===';
      if (token === '!=') return '!==';
      if (['&&', '||', '!', '(', ')'].includes(token)) return token;
      if (token === 'true' || token === 'false') return `'${token}'`;
      return `(ctx[${JSON.stringify(token)}] ?? '')`;
    })
    .join(' ');
  return Boolean(new Function('ctx', `return (${source});`)(context));
}

export const coldHosted = {
  'steps.runner-prereqs.outputs.dependencies_warm': 'false',
  'runner.environment': 'github-hosted',
  'runner.os': 'Linux',
  'inputs.package_cache': 'true',
  'inputs.reuse_merge_group_workspace': 'false',
  'inputs.save_merge_group_workspace': 'false',
  'steps.node-modules-cache.outcome': 'success',
  'steps.node-modules-cache.outputs.cache-hit': 'false',
  'steps.node-modules-cache.outputs.cache-matched-key': '',
  'github.event_name': 'push',
  'github.repository': 'JovieInc/Jovie',
  'github.event.pull_request.head.repo.full_name': 'JovieInc/Jovie',
};
