import { mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { runCommand } from './command';
import { OVERNIGHT_REPO_ROOT, OVERNIGHT_WEB_ROOT } from './paths';
import type { OvernightIssue, VerificationStep } from './types';

function sanitizeComponent(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function buildStandardVerificationSteps(
  issue: OvernightIssue,
  changedFiles: readonly string[]
): readonly VerificationStep[] {
  const biomeTargets =
    changedFiles.length > 0
      ? changedFiles.map(file =>
          relative(OVERNIGHT_WEB_ROOT, resolve(OVERNIGHT_REPO_ROOT, file))
        )
      : ['.'];
  const fileScopedBiomeArgs =
    biomeTargets.length > 0
      ? ['pnpm', 'exec', 'biome', 'check', ...biomeTargets]
      : ['pnpm', 'exec', 'biome', 'check', '.'];

  return [
    ...issue.verificationSteps,
    {
      id: `${issue.key}-typecheck`,
      label: 'TypeScript verification',
      kind: 'command',
      command: [
        'pnpm',
        'exec',
        'tsc',
        '--noEmit',
        '-p',
        'tsconfig.typecheck.json',
      ],
    },
    {
      id: `${issue.key}-biome`,
      label: 'Scoped Biome check',
      kind: 'command',
      command: fileScopedBiomeArgs,
    },
  ];
}

export function runVerificationSteps(
  runDir: string,
  issueKey: string,
  steps: readonly VerificationStep[]
) {
  const results = steps.map(step => {
    const result = runCommand(step.command, {
      cwd: OVERNIGHT_WEB_ROOT,
      env: step.env,
    });

    return {
      step,
      result,
    };
  });

  const failures = results.filter(entry => entry.result.code !== 0);
  const writes = Promise.all(
    results.map(async ({ step, result }) => {
      const baseName = `${sanitizeComponent(issueKey)}-${sanitizeComponent(
        step.id
      )}`;
      await mkdir(resolve(runDir, 'logs'), { recursive: true });
      await writeFile(
        resolve(runDir, 'logs', `${baseName}.stdout.log`),
        result.stdout,
        'utf8'
      );
      await writeFile(
        resolve(runDir, 'logs', `${baseName}.stderr.log`),
        result.stderr,
        'utf8'
      );
    })
  );

  return {
    ok: failures.length === 0,
    failures,
    writes,
  };
}
