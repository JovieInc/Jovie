import { runInNewContext } from 'node:vm';

export interface LighthouseStep {
  with?: Record<string, string>;
  id?: string;
  uses?: string;
  name?: string;
  if?: string;
  run: string;
  env: Record<string, string>;
  'continue-on-error'?: unknown;
}
export interface LighthouseJob {
  needs?: string[];
  steps: LighthouseStep[];
  'continue-on-error'?: unknown;
}
interface SelectOptions {
  download?: string;
  ephemeral?: boolean;
  relevant?: boolean;
  failed?: boolean;
  branch?: string;
  baseline?: boolean;
  started?: string;
}

export const selected = (
  step: LighthouseStep | undefined,
  available: string,
  {
    download = 'failure',
    ephemeral = false,
    relevant = true,
    failed = false,
    branch = 'fixture-branch',
    baseline = false,
    started = 'true',
  }: SelectOptions = {}
): boolean => {
  const expression = (step?.if ?? 'success()')
    .replace(/\$\{\{|\}\}/g, '')
    .replace(
      /\.(lighthouse-identity|lighthouse-baseline|background-build-start|download-build|neon-branch|ci-path-changes|neon-db)\b/g,
      "['$1']"
    );
  // Actions implicitly applies success() unless the expression explicitly
  // selects a status, such as the always() on evidence and cleanup steps.
  if (failed && !/\b(?:always|success|failure|cancelled)\(/.test(expression))
    return false;
  return runInNewContext(expression, {
    success: () => !failed,
    always: () => true,
    steps: {
      'lighthouse-identity': { outputs: { available } },
      'lighthouse-baseline': { outputs: { built: String(baseline) } },
      'background-build-start': { outputs: { started } },
      check_changes: { outputs: { run_full_ci: String(relevant) } },
      'download-build': { outcome: download },
      'neon-branch': { outputs: { branch_id: branch } },
    },
    needs: {
      'ci-path-changes': { outputs: { run_neon: String(ephemeral) } },
      'neon-db': { result: ephemeral ? 'success' : 'skipped' },
    },
  });
};
