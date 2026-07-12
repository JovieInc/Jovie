import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const triggerConfigPath = resolve(repoRoot, 'trigger.config.ts');
const triggerSourceDir = resolve(repoRoot, 'trigger');
const taskExtensions = new Set(['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts']);

interface TriggerIntegrationState {
  configExists: boolean;
  dependencies: Record<string, string>;
  taskSources: Array<{ path: string; source: string }>;
}

function isDeployableTaskSource(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'trigger-task.ts',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const importedConstructors = new Map<string, 'schedules' | 'task'>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !/^@trigger\.dev\/sdk(?:\/v3)?$/.test(statement.moduleSpecifier.text)
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'task' || importedName === 'schedules') {
        importedConstructors.set(element.name.text, importedName);
      }
    }
  }

  return sourceFile.statements.some(statement => {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
      )
    ) {
      return false;
    }

    return statement.declarationList.declarations.some(declaration => {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) return false;

      if (ts.isIdentifier(initializer.expression)) {
        return importedConstructors.get(initializer.expression.text) === 'task';
      }

      return (
        ts.isPropertyAccessExpression(initializer.expression) &&
        ts.isIdentifier(initializer.expression.expression) &&
        importedConstructors.get(initializer.expression.expression.text) ===
          'schedules' &&
        initializer.expression.name.text === 'task'
      );
    });
  });
}

function integrationErrors(state: TriggerIntegrationState): string[] {
  if (!state.configExists) return [];

  const errors: string[] = [];

  if (!state.dependencies['@trigger.dev/sdk']) {
    errors.push('trigger.config.ts requires @trigger.dev/sdk');
  }
  if (!state.dependencies['trigger.dev']) {
    errors.push('trigger.config.ts requires the trigger.dev CLI');
  }
  if (
    !state.taskSources.some(taskSource =>
      isDeployableTaskSource(taskSource.source)
    )
  ) {
    errors.push(
      'trigger.config.ts requires at least one Trigger.dev task source'
    );
  }

  return errors;
}

function findTaskSources(
  directory: string
): Array<{ path: string; source: string }> {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && taskExtensions.has(extname(entry.name)))
    .map(entry => {
      const path = join(entry.parentPath, entry.name);
      return { path, source: readFileSync(path, 'utf8') };
    });
}

describe('Trigger.dev integration contract', () => {
  it('keeps the repository integration inactive until a complete implementation exists', () => {
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
      integrationErrors({
        configExists: existsSync(triggerConfigPath),
        dependencies,
        taskSources: findTaskSources(triggerSourceDir),
      })
    ).toEqual([]);
  });

  it('fails closed when an active config has no SDK, CLI, or task source', () => {
    expect(
      integrationErrors({
        configExists: true,
        dependencies: {},
        taskSources: [],
      })
    ).toEqual([
      'trigger.config.ts requires @trigger.dev/sdk',
      'trigger.config.ts requires the trigger.dev CLI',
      'trigger.config.ts requires at least one Trigger.dev task source',
    ]);
  });

  it('rejects helper-only source files as non-deployable', () => {
    expect(
      integrationErrors({
        configExists: true,
        dependencies: {
          '@trigger.dev/sdk': 'latest',
          'trigger.dev': 'latest',
        },
        taskSources: [
          {
            path: 'trigger/helper.ts',
            source: 'export function helper() { return true; }',
          },
        ],
      })
    ).toEqual([
      'trigger.config.ts requires at least one Trigger.dev task source',
    ]);
  });

  it('rejects commented-out task code as non-deployable', () => {
    expect(
      integrationErrors({
        configExists: true,
        dependencies: {
          '@trigger.dev/sdk': 'latest',
          'trigger.dev': 'latest',
        },
        taskSources: [
          {
            path: 'trigger/commented.ts',
            source:
              "// import { task } from '@trigger.dev/sdk/v3';\n// export const disabled = task({ id: 'disabled', run: async () => true });",
          },
        ],
      })
    ).toEqual([
      'trigger.config.ts requires at least one Trigger.dev task source',
    ]);
  });

  it('requires all implementation pieces before activation', () => {
    expect(
      integrationErrors({
        configExists: true,
        dependencies: {
          '@trigger.dev/sdk': 'latest',
          'trigger.dev': 'latest',
        },
        taskSources: [
          {
            path: 'trigger/example.ts',
            source:
              "import { task } from '@trigger.dev/sdk/v3'; export const example = task({ id: 'example', run: async () => true });",
          },
        ],
      })
    ).toEqual([]);
  });
});
