import ts from 'typescript';

export function getPageScopedLocatorCalls(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'chat-visual.spec.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const calls: string[] = [];

  function getPageMethod(expression: ts.LeftHandSideExpression): string | null {
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'page'
    ) {
      return expression.name.text;
    }

    if (
      ts.isElementAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'page'
    ) {
      return expression.argumentExpression &&
        ts.isStringLiteralLike(expression.argumentExpression)
        ? expression.argumentExpression.text
        : '<computed>';
    }

    return null;
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const method = getPageMethod(node.expression);

      if (
        method === '<computed>' ||
        method === 'locator' ||
        method?.startsWith('getBy') ||
        (method !== null && /^\$\$?$/.test(method))
      ) {
        const firstArgument = node.arguments[0]?.getText(sourceFile) ?? '';
        calls.push(`${method}:${firstArgument}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

export function getScreenshotArguments(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'visual-spec.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const argumentsFound: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'toHaveScreenshot'
    ) {
      argumentsFound.push(node.arguments[0]?.getText(sourceFile) ?? '');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return argumentsFound;
}
