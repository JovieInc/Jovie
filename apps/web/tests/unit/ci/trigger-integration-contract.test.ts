import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const triggerConfigPath = resolve(repoRoot, 'trigger.config.ts');
const triggerSourceDir = resolve(repoRoot, 'trigger');
const taskExtensions = new Set(['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts']);

interface TriggerIntegrationState {
  configExists: boolean;
  dependencies: Record<string, string>;
  taskSources: string[];
}

function retiredIntegrationErrors(state: TriggerIntegrationState): string[] {
  const errors: string[] = [];
  if (state.configExists) {
    errors.push('Trigger.dev is retired: trigger.config.ts must be absent');
  }
  if (state.dependencies['@trigger.dev/sdk']) {
    errors.push('Trigger.dev is retired: @trigger.dev/sdk must be absent');
  }
  if (state.dependencies['trigger.dev']) {
    errors.push('Trigger.dev is retired: trigger.dev CLI must be absent');
  }
  if (state.taskSources.length > 0) {
    errors.push('Trigger.dev is retired: trigger task sources must be absent');
  }
  return errors;
}

function findTaskSources(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && taskExtensions.has(extname(entry.name)))
    .map(entry => join(entry.parentPath, entry.name));
}

describe('retired Trigger.dev integration contract', () => {
  it('keeps every Trigger.dev activation surface absent', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    expect(
      retiredIntegrationErrors({
        configExists: existsSync(triggerConfigPath),
        dependencies,
        taskSources: findTaskSources(triggerSourceDir),
      })
    ).toEqual([]);
  });

  it('fails closed if a config is restored', () => {
    expect(
      retiredIntegrationErrors({
        configExists: true,
        dependencies: {},
        taskSources: [],
      })
    ).toEqual(['Trigger.dev is retired: trigger.config.ts must be absent']);
  });

  it('fails closed if packages are restored', () => {
    expect(
      retiredIntegrationErrors({
        configExists: false,
        dependencies: {
          '@trigger.dev/sdk': 'latest',
          'trigger.dev': 'latest',
        },
        taskSources: [],
      })
    ).toEqual([
      'Trigger.dev is retired: @trigger.dev/sdk must be absent',
      'Trigger.dev is retired: trigger.dev CLI must be absent',
    ]);
  });

  it('fails closed if a task source is restored', () => {
    expect(
      retiredIntegrationErrors({
        configExists: false,
        dependencies: {},
        taskSources: ['trigger/example.ts'],
      })
    ).toEqual(['Trigger.dev is retired: trigger task sources must be absent']);
  });
});
