import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const shellDir = resolve(process.cwd(), 'app/exp/shell-v1');
const routeSource = readFileSync(resolve(shellDir, 'page.tsx'), 'utf8');
const clientSource = readFileSync(
  resolve(shellDir, 'ShellV1ExperimentClient.tsx'),
  'utf8'
);

function directUseEffectCount(
  body: ts.Block,
  sourceFile: ts.SourceFile
): number {
  let count = 0;

  function visit(node: ts.Node) {
    if (
      node !== body &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node))
    ) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useEffect'
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(body);
  expect(sourceFile.parseDiagnostics).toEqual([]);
  return count;
}

function componentEffectCounts(source: string) {
  const sourceFile = ts.createSourceFile(
    'ShellV1ExperimentClient.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  return sourceFile.statements.flatMap(statement => {
    if (
      !ts.isFunctionDeclaration(statement) ||
      !statement.name ||
      !statement.body ||
      !/^[A-Z]/.test(statement.name.text)
    ) {
      return [];
    }
    return [
      {
        name: statement.name.text,
        useEffects: directUseEffectCount(statement.body, sourceFile),
      },
    ];
  });
}

describe('JOV-3866 shell-v1 module boundaries', () => {
  it('keeps the route entry thin and delegates to the client fixture', () => {
    expect(routeSource.split('\n').length).toBeLessThan(400);
    expect(routeSource).toContain(
      "import ShellV1ExperimentClient from './ShellV1ExperimentClient'"
    );
    expect(routeSource).toContain('<ShellV1ExperimentClient />');
  });

  it('keeps direct effects below the per-component ceiling', () => {
    const offenders = componentEffectCounts(clientSource).filter(
      component => component.useEffects > 4
    );

    expect(offenders).toEqual([]);
  });
});
