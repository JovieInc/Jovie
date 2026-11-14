import ts from 'typescript';

/** Parse source with the pinned compiler, rejecting incomplete parser evidence.
 * @param {string} path
 * @param {string} contents
 */
export function parseModule(path, contents) {
  const tree = ts.createSourceFile(
    path,
    contents,
    ts.ScriptTarget.Latest,
    true
  );
  // The compiler exposes diagnostics at runtime but omits this public type.
  const diagnostics =
    /** @type {ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }} */ (
      tree
    ).parseDiagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length > 0) {
    throw new Error(`Cannot parse mutation import graph: ${path}`);
  }
  return tree;
}

/**
 * Exclude only erased declarations and static re-export wiring. Re-exports
 * still load runtime dependencies: import-graph traversal must retain them.
 * Missing, malformed, or other runtime source remains selected and must pass
 * the normal execution/report checks; zero mutants alone never prove a skip.
 * @param {string} path
 * @param {string} contents
 */
export function hasMutationSource(path, contents) {
  let tree;
  try {
    tree = parseModule(path, contents);
  } catch {
    return true;
  }
  return tree.statements.some(statement => {
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEmptyStatement(statement) ||
      ((ts.isVariableStatement(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
        ts
          .getModifiers(statement)
          ?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword))
    )
      return false;
    if (ts.isImportDeclaration(statement))
      return !statement.importClause?.isTypeOnly;
    if (ts.isImportEqualsDeclaration(statement)) return !statement.isTypeOnly;
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      return !(
        statement.isTypeOnly ||
        (statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          !statement.modifiers?.length &&
          !statement.attributes) ||
        (!statement.moduleSpecifier &&
          clause &&
          ts.isNamedExports(clause) &&
          clause.elements.length === 0)
      );
    }
    return true;
  });
}
