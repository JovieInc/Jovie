import path from 'node:path';
import ts from 'typescript';
import type {
  AppScreenCanvasContract,
  AppScreenNestedCanvasAllowance,
} from '@/data/appScreens';

export interface CanvasSourceInput {
  readonly path: string;
  readonly source: string;
}
export interface CanvasSourceViolation {
  readonly path: string;
  readonly line: number;
  readonly component:
    | 'PageShell'
    | 'AppShellContentPanel'
    | 'LINEAR_SURFACE.contentContainer';
  readonly enclosingFunction: string;
  readonly reason: 'unauthorized-occurrence' | 'unused-allowance';
}
export interface CanvasRouteAllowanceViolation {
  readonly routeSource: string;
  readonly allowanceSource: string;
  readonly reason: 'allowance-unreachable-from-route';
}
type CanvasComponent = 'PageShell' | 'AppShellContentPanel';
type CanvasPropValue = string | '__dynamic__' | null;
interface CanvasPropState {
  frame: CanvasPropValue;
  surfaceMode: CanvasPropValue;
}
const CANVAS_COMPONENTS = new Set<CanvasComponent>([
  'PageShell',
  'AppShellContentPanel',
]);
const CANONICAL_CONTENT_PANEL_SOURCE =
  'apps/web/components/organisms/AppShellContentPanel.tsx';
const CANONICAL_PAGE_SHELL_SOURCE =
  'apps/web/components/organisms/PageShell.tsx';
const CANVAS_COMPONENT_MARKERS = [...CANVAS_COMPONENTS] as const;
const CANVAS_SOURCE_MARKERS = [
  ...CANVAS_COMPONENT_MARKERS,
  'LINEAR_SURFACE',
] as const;
function dynamicImportSpecifiers(node: ts.Node): readonly string[] {
  const specifiers: string[] = [];
  const visit = (current: ts.Node): void => {
    if (
      ts.isCallExpression(current) &&
      current.expression.kind === ts.SyntaxKind.ImportKeyword &&
      current.arguments[0] &&
      ts.isStringLiteralLike(current.arguments[0])
    ) {
      specifiers.push(current.arguments[0].text);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return specifiers;
}
function importedModuleSpecifiers(
  sourceFile: ts.SourceFile
): readonly string[] {
  const specifiers: string[] = [];
  sourceFile.forEachChild(node => {
    if (ts.isImportDeclaration(node)) {
      if (
        importHasRuntimeEdge(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifiers.push(node.moduleSpecifier.text);
      }
      return;
    }
    if (
      ts.isExportDeclaration(node) &&
      exportHasRuntimeEdge(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });
  specifiers.push(...dynamicImportSpecifiers(sourceFile));
  return specifiers;
}
function importHasRuntimeEdge(node: ts.ImportDeclaration): boolean {
  const importClause = node.importClause;
  if (!importClause) return true;
  if (importClause.isTypeOnly) return false;
  if (importClause.name) return true;
  const namedBindings = importClause.namedBindings;
  if (!namedBindings) return true;
  if (!ts.isNamedImports(namedBindings)) return true;
  if (namedBindings.elements.length === 0) return true;
  return namedBindings.elements.some(element => !element.isTypeOnly);
}
function exportHasRuntimeEdge(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  const exportClause = node.exportClause;
  if (!exportClause) return true;
  if (!ts.isNamedExports(exportClause)) return true;
  if (exportClause.elements.length === 0) return true;
  return exportClause.elements.some(element => !element.isTypeOnly);
}
function resolveModuleSource(
  from: string,
  specifier: string,
  knownSources: ReadonlySet<string>
): string | null {
  let unresolvedSources: readonly string[];
  if (specifier.startsWith('@/')) {
    const alias = specifier.slice(2);
    const componentAliases = ['atoms', 'molecules', 'organisms', 'features'];
    const [prefix, ...remainder] = alias.split('/');
    unresolvedSources = componentAliases.includes(prefix ?? '')
      ? [`apps/web/components/${prefix}/${remainder.join('/')}`]
      : prefix === 'app'
        ? [
            `apps/web/app/${remainder.join('/')}`,
            `apps/web/app/app/${remainder.join('/')}`,
          ]
        : [`apps/web/${alias}`];
  } else if (specifier.startsWith('.')) {
    unresolvedSources = [
      path.posix.normalize(
        path.posix.join(path.posix.dirname(from), specifier)
      ),
    ];
  } else {
    return null;
  }
  for (const unresolved of unresolvedSources) {
    for (const candidate of [
      unresolved,
      `${unresolved}.ts`,
      `${unresolved}.tsx`,
      `${unresolved}/index.ts`,
      `${unresolved}/index.tsx`,
    ]) {
      if (knownSources.has(candidate)) return candidate;
    }
  }
  return null;
}
function createSourceFile(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}
function canvasSeedPaths(
  files: readonly CanvasSourceInput[]
): ReadonlySet<string> {
  return new Set(
    files
      .filter(file =>
        CANVAS_SOURCE_MARKERS.some(marker => file.source.includes(marker))
      )
      .map(file => file.path)
  );
}
export function findUnboundCanvasRouteAllowances(
  files: readonly CanvasSourceInput[],
  exceptions: Readonly<Record<string, AppScreenCanvasContract>>
): readonly CanvasRouteAllowanceViolation[] {
  const sources = new Map(files.map(file => [file.path, file.source]));
  const knownSources = new Set(sources.keys());
  const violations: CanvasRouteAllowanceViolation[] = [];
  for (const [routeSource, contract] of Object.entries(exceptions)) {
    const targets = new Set(
      contract.nestedCanvasAllowances.map(allowance => allowance.source)
    );
    const reachable = new Set<string>([routeSource]);
    const visited = new Set<string>();
    const pending = [routeSource];
    while (
      pending.length > 0 &&
      [...targets].some(target => !reachable.has(target))
    ) {
      const current = pending.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      const source = sources.get(current);
      if (!source) continue;
      const sourceFile = createSourceFile(current, source);
      for (const specifier of importedModuleSpecifiers(sourceFile)) {
        const resolved = resolveModuleSource(current, specifier, knownSources);
        if (resolved && !reachable.has(resolved)) {
          reachable.add(resolved);
          pending.push(resolved);
        }
      }
    }
    for (const allowance of contract.nestedCanvasAllowances) {
      if (!reachable.has(allowance.source)) {
        violations.push({
          routeSource,
          allowanceSource: allowance.source,
          reason: 'allowance-unreachable-from-route',
        });
      }
    }
  }
  return violations;
}
function allowanceKey(
  path: string,
  component: string,
  enclosingFunction: string
): string {
  return [path, component, enclosingFunction].join('\0');
}
function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}
function componentFromExpression(
  expression: ts.Expression,
  aliases: ReadonlyMap<string, CanvasComponent>,
  sourceFile: ts.SourceFile
): CanvasComponent | null {
  const current = unwrap(expression);
  const text = current.getText(sourceFile);
  const direct = aliases.get(text);
  if (direct) return direct;
  if (ts.isCallExpression(current)) {
    for (const argument of current.arguments) {
      const component = componentFromExpression(argument, aliases, sourceFile);
      if (component) return component;
    }
  }
  if (ts.isConditionalExpression(current)) {
    return (
      componentFromExpression(current.whenTrue, aliases, sourceFile) ??
      componentFromExpression(current.whenFalse, aliases, sourceFile)
    );
  }
  if (
    ts.isBinaryExpression(current) &&
    (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      current.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return (
      componentFromExpression(current.left, aliases, sourceFile) ??
      componentFromExpression(current.right, aliases, sourceFile)
    );
  }
  return null;
}
function staticMemberName(name: ts.Node): string | null {
  return ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
    ? name.text
    : null;
}
function collectLocalAliases(
  sourceFile: ts.SourceFile,
  aliases: Map<string, CanvasComponent>
): boolean {
  let changedAny = false;
  let changed = true;
  while (changed) {
    changed = false;
    const record = (
      name: string,
      component: CanvasComponent | null | undefined
    ): void => {
      if (component && setCanvasAlias(aliases, name, component)) {
        changed = true;
        changedAny = true;
      }
    };
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const initializer = unwrap(node.initializer);
        if (ts.isIdentifier(node.name)) {
          record(
            node.name.text,
            componentFromExpression(initializer, aliases, sourceFile)
          );
          if (ts.isObjectLiteralExpression(initializer)) {
            for (const property of initializer.properties) {
              if (
                !ts.isPropertyAssignment(property) &&
                !ts.isShorthandPropertyAssignment(property)
              ) {
                continue;
              }
              const name = staticMemberName(property.name);
              const expression = ts.isPropertyAssignment(property)
                ? property.initializer
                : property.name;
              if (name) {
                record(
                  `${node.name.text}.${name}`,
                  componentFromExpression(expression, aliases, sourceFile)
                );
              }
            }
          }
          if (ts.isArrayLiteralExpression(initializer)) {
            initializer.elements.forEach((element, index) => {
              record(
                `${node.name.text}.${index}`,
                componentFromExpression(element, aliases, sourceFile)
              );
            });
          }
        }
        if (ts.isObjectBindingPattern(node.name)) {
          const base = initializer.getText(sourceFile);
          for (const element of node.name.elements) {
            if (
              !ts.isIdentifier(element.name) ||
              element.dotDotDotToken !== undefined
            ) {
              continue;
            }
            const name = staticMemberName(element.propertyName ?? element.name);
            record(
              element.name.text,
              name ? aliases.get(`${base}.${name}`) : null
            );
          }
        }
        if (ts.isArrayBindingPattern(node.name)) {
          const base = initializer.getText(sourceFile);
          node.name.elements.forEach((element, index) => {
            if (
              !ts.isBindingElement(element) ||
              !ts.isIdentifier(element.name)
            ) {
              return;
            }
            const arrayElement = ts.isArrayLiteralExpression(initializer)
              ? initializer.elements[index]
              : undefined;
            record(
              element.name.text,
              arrayElement
                ? componentFromExpression(arrayElement, aliases, sourceFile)
                : aliases.get(`${base}.${index}`)
            );
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return changedAny;
}
interface ParsedSource {
  readonly input: CanvasSourceInput;
  readonly sourceFile: ts.SourceFile;
  readonly aliases: Map<string, CanvasComponent>;
}
function createParsedSource(input: CanvasSourceInput): ParsedSource {
  return {
    input,
    sourceFile: createSourceFile(input.path, input.source),
    aliases: new Map(
      [...CANVAS_COMPONENTS].map(component => [component, component] as const)
    ),
  };
}
function collectDirectAliases(file: ParsedSource): void {
  for (const statement of file.sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && !importHasRuntimeEdge(statement)) {
      continue;
    }
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : undefined;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      if (specifier.isTypeOnly) continue;
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (CANVAS_COMPONENTS.has(imported as CanvasComponent)) {
        file.aliases.set(specifier.name.text, imported as CanvasComponent);
      }
    }
  }
  if (
    CANVAS_COMPONENT_MARKERS.some(marker => file.input.source.includes(marker))
  ) {
    collectLocalAliases(file.sourceFile, file.aliases);
  }
}
function exportedAliases(
  parsed: readonly ParsedSource[]
): Map<string, Map<string, CanvasComponent>> {
  const knownSources = new Set(parsed.map(file => file.input.path));
  const exported = new Map<string, Map<string, CanvasComponent>>(
    parsed.map(
      file => [file.input.path, new Map<string, CanvasComponent>()] as const
    )
  );
  for (const file of parsed) {
    const names = exported.get(file.input.path);
    if (!names) continue;
    for (const statement of file.sourceFile.statements) {
      if (
        ts.isVariableStatement(statement) &&
        ts
          .getModifiers(statement)
          ?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          const component = file.aliases.get(declaration.name.text);
          if (component) names.set(declaration.name.text, component);
          collectPrefixedCanvasAliases(
            file.aliases,
            names,
            declaration.name.text,
            declaration.name.text
          );
        }
      }
      if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        const component = componentFromExpression(
          statement.expression,
          file.aliases,
          file.sourceFile
        );
        if (component) names.set('default', component);
      }
      if (!ts.isExportDeclaration(statement) || !statement.exportClause) {
        continue;
      }
      if (statement.isTypeOnly || !ts.isNamedExports(statement.exportClause)) {
        continue;
      }
      for (const specifier of statement.exportClause.elements) {
        if (specifier.isTypeOnly) continue;
        const localName = (specifier.propertyName ?? specifier.name).text;
        const exportedName = specifier.name.text;
        if (!statement.moduleSpecifier) {
          const localComponent = file.aliases.get(localName);
          if (localComponent) names.set(exportedName, localComponent);
          if (
            collectPrefixedCanvasAliases(
              file.aliases,
              names,
              localName,
              exportedName
            )
          ) {
            continue;
          }
          if (localComponent) {
            continue;
          }
        }
        if (CANVAS_COMPONENTS.has(localName as CanvasComponent)) {
          names.set(exportedName, localName as CanvasComponent);
        }
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of parsed) {
      const names = exported.get(file.input.path);
      if (!names) continue;
      for (const statement of file.sourceFile.statements) {
        if (
          !ts.isExportDeclaration(statement) ||
          statement.isTypeOnly ||
          !statement.moduleSpecifier ||
          !ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          continue;
        }
        const targetPath = resolveModuleSource(
          file.input.path,
          statement.moduleSpecifier.text,
          knownSources
        );
        const target = targetPath ? exported.get(targetPath) : undefined;
        if (!target) continue;
        if (!statement.exportClause) {
          for (const [exportName, component] of target) {
            if (exportName === 'default' || names.has(exportName)) continue;
            names.set(exportName, component);
            changed = true;
          }
          continue;
        }
        if (ts.isNamedExports(statement.exportClause)) {
          for (const specifier of statement.exportClause.elements) {
            if (specifier.isTypeOnly) continue;
            const localName = (specifier.propertyName ?? specifier.name).text;
            const component = target.get(localName);
            if (component) {
              changed =
                setCanvasAlias(names, specifier.name.text, component) ||
                changed;
            }
            changed =
              collectPrefixedCanvasAliases(
                target,
                names,
                localName,
                specifier.name.text
              ) || changed;
          }
        }
      }
    }
  }
  return exported;
}
function setCanvasAlias(
  aliases: Map<string, CanvasComponent>,
  name: string,
  component: CanvasComponent
): boolean {
  if (aliases.has(name)) return false;
  aliases.set(name, component);
  return true;
}
function firstCanvasExport(
  target: ReadonlyMap<string, CanvasComponent>
): CanvasComponent | null {
  return target.get('default') ?? [...target.values()][0] ?? null;
}
function hasPrefixedCanvasAlias(
  source: ReadonlyMap<string, CanvasComponent>,
  from: string
): boolean {
  const prefix = `${from}.`;
  return [...source.keys()].some(name => name.startsWith(prefix));
}
function collectPrefixedCanvasAliases(
  source: ReadonlyMap<string, CanvasComponent>,
  target: Map<string, CanvasComponent>,
  from: string,
  to: string
): boolean {
  let changed = false;
  const prefix = `${from}.`;
  for (const [name, component] of source) {
    if (name.startsWith(prefix)) {
      const alias = `${to}.${name.slice(prefix.length)}`;
      changed = setCanvasAlias(target, alias, component) || changed;
    }
  }
  return changed;
}
function collectImportedCanvasAliases(
  file: ParsedSource,
  exported: ReadonlyMap<string, ReadonlyMap<string, CanvasComponent>>,
  knownSources: ReadonlySet<string>
): boolean {
  let changed = false;
  for (const statement of file.sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !importHasRuntimeEdge(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      continue;
    }
    const targetPath = resolveModuleSource(
      file.input.path,
      statement.moduleSpecifier.text,
      knownSources
    );
    const target = targetPath ? exported.get(targetPath) : undefined;
    if (!target) continue;
    if (statement.importClause.name) {
      const component = target.get('default');
      if (component) {
        changed =
          setCanvasAlias(
            file.aliases,
            statement.importClause.name.text,
            component
          ) || changed;
      }
    }
    const namedBindings = statement.importClause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const specifier of namedBindings.elements) {
        if (specifier.isTypeOnly) continue;
        const imported = (specifier.propertyName ?? specifier.name).text;
        const component = target.get(imported);
        if (component) {
          changed =
            setCanvasAlias(file.aliases, specifier.name.text, component) ||
            changed;
        }
        changed =
          collectPrefixedCanvasAliases(
            target,
            file.aliases,
            imported,
            specifier.name.text
          ) || changed;
      }
    }
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      for (const [exportName, component] of target) {
        if (exportName === 'default') continue;
        changed =
          setCanvasAlias(
            file.aliases,
            `${namedBindings.name.text}.${exportName}`,
            component
          ) || changed;
      }
    }
  }
  const visitDynamicAliases = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      for (const specifier of dynamicImportSpecifiers(node.initializer)) {
        const targetPath = resolveModuleSource(
          file.input.path,
          specifier,
          knownSources
        );
        const target = targetPath ? exported.get(targetPath) : undefined;
        const component = target ? firstCanvasExport(target) : null;
        if (component) {
          changed =
            setCanvasAlias(file.aliases, node.name.text, component) || changed;
        }
      }
    }
    ts.forEachChild(node, visitDynamicAliases);
  };
  visitDynamicAliases(file.sourceFile);
  return changed;
}
function resolveParsedCanvasAliases(
  parsed: readonly ParsedSource[],
  knownSources: ReadonlySet<string>
): Map<string, Map<string, CanvasComponent>> {
  let exported = exportedAliases(parsed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of parsed) {
      changed =
        collectImportedCanvasAliases(file, exported, knownSources) || changed;
      changed = collectLocalAliases(file.sourceFile, file.aliases) || changed;
    }
    if (changed) exported = exportedAliases(parsed);
  }
  return exported;
}
function referencesCanvasExport(
  input: CanvasSourceInput,
  exported: ReadonlyMap<string, ReadonlyMap<string, CanvasComponent>>,
  knownSources: ReadonlySet<string>
): boolean {
  if (!/\b(?:import|export)\b/.test(input.source)) return false;
  const sourceFile = createSourceFile(input.path, input.source);
  for (const specifier of dynamicImportSpecifiers(sourceFile)) {
    const targetPath = resolveModuleSource(input.path, specifier, knownSources);
    const target = targetPath ? exported.get(targetPath) : undefined;
    if (target && firstCanvasExport(target)) return true;
  }
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      importHasRuntimeEdge(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.importClause
    ) {
      const targetPath = resolveModuleSource(
        input.path,
        statement.moduleSpecifier.text,
        knownSources
      );
      const target = targetPath ? exported.get(targetPath) : undefined;
      if (!target) continue;
      if (statement.importClause.name && target.has('default')) return true;
      const namedBindings = statement.importClause.namedBindings;
      if (
        namedBindings &&
        ts.isNamedImports(namedBindings) &&
        namedBindings.elements.some(specifier => {
          const imported = (specifier.propertyName ?? specifier.name).text;
          return (
            !specifier.isTypeOnly &&
            (target.has(imported) || hasPrefixedCanvasAlias(target, imported))
          );
        })
      ) {
        return true;
      }
      if (
        namedBindings &&
        ts.isNamespaceImport(namedBindings) &&
        [...target.keys()].some(exportName => exportName !== 'default')
      ) {
        return true;
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      exportHasRuntimeEdge(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const targetPath = resolveModuleSource(
        input.path,
        statement.moduleSpecifier.text,
        knownSources
      );
      const target = targetPath ? exported.get(targetPath) : undefined;
      if (!target) continue;
      if (!statement.exportClause) {
        return [...target.keys()].some(exportName => exportName !== 'default');
      }
      if (
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some(specifier => {
          const exportedName = (specifier.propertyName ?? specifier.name).text;
          return (
            !specifier.isTypeOnly &&
            (target.has(exportedName) ||
              hasPrefixedCanvasAlias(target, exportedName))
          );
        })
      ) {
        return true;
      }
    }
  }
  return false;
}
function parseCandidate(
  parsedByPath: Map<string, ParsedSource>,
  input: CanvasSourceInput
): void {
  if (parsedByPath.has(input.path)) return;
  const parsedSource = createParsedSource(input);
  collectDirectAliases(parsedSource);
  parsedByPath.set(input.path, parsedSource);
}
function parsedValues(
  parsedByPath: ReadonlyMap<string, ParsedSource>
): readonly ParsedSource[] {
  return [...parsedByPath.values()];
}
function parseCanvasSources(
  files: readonly CanvasSourceInput[]
): readonly ParsedSource[] {
  const knownSources = new Set(files.map(file => file.path));
  const seedPaths = canvasSeedPaths(files);
  const parsedByPath = new Map<string, ParsedSource>();
  for (const file of files) {
    if (seedPaths.has(file.path)) parseCandidate(parsedByPath, file);
  }
  let changed = true;
  while (changed) {
    changed = false;
    const exported = resolveParsedCanvasAliases(
      parsedValues(parsedByPath),
      knownSources
    );
    for (const file of files) {
      if (parsedByPath.has(file.path)) continue;
      if (referencesCanvasExport(file, exported, knownSources)) {
        parseCandidate(parsedByPath, file);
        changed = true;
      }
    }
  }
  resolveParsedCanvasAliases(parsedValues(parsedByPath), knownSources);
  return parsedValues(parsedByPath);
}
function staticText(expression: ts.Expression): string | null {
  const current = unwrap(expression);
  return ts.isStringLiteralLike(current) ? current.text : null;
}
function setCanvasProp(
  state: CanvasPropState,
  name: string,
  value: CanvasPropValue
): void {
  if (name === 'frame') state.frame = value;
  if (name === 'surfaceMode') state.surfaceMode = value;
}
function applyCanvasSpread(
  expression: ts.Expression,
  state: CanvasPropState
): boolean {
  const current = unwrap(expression);
  if (!ts.isObjectLiteralExpression(current)) return false;
  for (const property of current.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!applyCanvasSpread(property.expression, state)) {
        state.frame = '__dynamic__';
        state.surfaceMode = '__dynamic__';
      }
      continue;
    }
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }
    const name =
      ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
        ? property.name.text
        : null;
    if (!name) {
      state.frame = '__dynamic__';
      state.surfaceMode = '__dynamic__';
    } else if (name === 'frame' || name === 'surfaceMode') {
      setCanvasProp(
        state,
        name,
        ts.isPropertyAssignment(property)
          ? (staticText(property.initializer) ?? '__dynamic__')
          : '__dynamic__'
      );
    }
  }
  return true;
}
function finalCanvasProps(
  node: ts.JsxOpeningLikeElement,
  sourceFile: ts.SourceFile
): CanvasPropState {
  const state = { frame: null, surfaceMode: null } satisfies {
    frame: CanvasPropValue;
    surfaceMode: CanvasPropValue;
  };
  for (const property of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      if (!applyCanvasSpread(property.expression, state)) {
        state.frame = '__dynamic__';
        state.surfaceMode = '__dynamic__';
      }
      continue;
    }
    const name = property.name.getText(sourceFile);
    if (name !== 'frame' && name !== 'surfaceMode') continue;
    const expression =
      property.initializer && ts.isJsxExpression(property.initializer)
        ? property.initializer.expression
        : undefined;
    setCanvasProp(
      state,
      name,
      property.initializer && ts.isStringLiteral(property.initializer)
        ? property.initializer.text
        : expression
          ? (staticText(expression) ?? '__dynamic__')
          : '__dynamic__'
    );
  }
  return state;
}
function createElementCanvasProps(
  expression: ts.Expression | undefined
): CanvasPropState {
  const state = { frame: null, surfaceMode: null } satisfies CanvasPropState;
  if (!expression) return state;
  const current = unwrap(expression);
  if (
    current.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(current) && current.text === 'undefined')
  ) {
    return state;
  }
  if (!applyCanvasSpread(current, state)) {
    state.frame = '__dynamic__';
    state.surfaceMode = '__dynamic__';
  }
  return state;
}
function containsFunction(expression: ts.Expression): boolean {
  const current = unwrap(expression);
  return (
    ts.isArrowFunction(current) ||
    ts.isFunctionExpression(current) ||
    (ts.isCallExpression(current) &&
      current.arguments.some(argument => containsFunction(argument)))
  );
}
function reactCreateElementAliases(
  sourceFile: ts.SourceFile
): ReadonlySet<string> {
  const aliases = new Set(['React.createElement', 'createElement']);
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      !node.importClause?.isTypeOnly &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'react'
    ) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          if (
            !specifier.isTypeOnly &&
            (specifier.propertyName ?? specifier.name).text === 'createElement'
          ) {
            aliases.add(specifier.name.text);
          }
        }
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      aliases.has(unwrap(node.initializer).getText(sourceFile))
    ) {
      aliases.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return aliases;
}
function functionName(node: ts.Node, inherited: string): string {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) && node.name) return node.name.getText();
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    containsFunction(node.initializer)
  ) {
    return node.name.text;
  }
  return inherited;
}
function linearSurfaceAliases(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const aliases = new Set(['LINEAR_SURFACE']);
  for (const statement of sourceFile.statements) {
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : undefined;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      if (
        (specifier.propertyName ?? specifier.name).text === 'LINEAR_SURFACE'
      ) {
        aliases.add(specifier.name.text);
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        aliases.has(unwrap(node.initializer).getText(sourceFile)) &&
        !aliases.has(node.name.text)
      ) {
        aliases.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return aliases;
}
function rawContentContainerNode(
  node: ts.Node,
  aliases: ReadonlySet<string>,
  sourceFile: ts.SourceFile
): boolean {
  const isSurface = (expression: ts.Expression): boolean =>
    aliases.has(unwrap(expression).getText(sourceFile));
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === 'contentContainer' && isSurface(node.expression);
  }
  if (ts.isElementAccessExpression(node)) {
    const name = node.argumentExpression
      ? staticText(node.argumentExpression)
      : null;
    return name === 'contentContainer' && isSurface(node.expression);
  }
  if (!ts.isBindingElement(node)) return false;
  const name = node.propertyName ?? node.name;
  const declaration = node.parent.parent;
  return (
    (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) &&
    name.text === 'contentContainer' &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer !== undefined &&
    isSurface(declaration.initializer)
  );
}
function shouldReportCanvasViolation(
  inputPath: string,
  component: CanvasComponent,
  enclosingFunction: string,
  props: CanvasPropState,
  remainingAllowances: Map<string, AppScreenNestedCanvasAllowance>
): boolean {
  const isSafe = props.frame === 'none' || props.surfaceMode === 'table';
  if (isSafe) return false;
  const canonicalPageShell =
    inputPath === CANONICAL_PAGE_SHELL_SOURCE &&
    component === 'AppShellContentPanel' &&
    enclosingFunction === 'PageShell';
  if (canonicalPageShell) return false;
  const isDynamic =
    props.frame === '__dynamic__' || props.surfaceMode === '__dynamic__';
  const key = allowanceKey(inputPath, component, enclosingFunction);
  const hasAllowance = remainingAllowances.delete(key);
  return isDynamic || !hasAllowance;
}
export function findUnauthorizedCanvasSources(
  files: readonly CanvasSourceInput[],
  allowances: readonly AppScreenNestedCanvasAllowance[]
): readonly CanvasSourceViolation[] {
  const violations: CanvasSourceViolation[] = [];
  const remainingAllowances = new Map<string, AppScreenNestedCanvasAllowance>();
  for (const allowance of allowances) {
    remainingAllowances.set(
      allowanceKey(
        allowance.source,
        allowance.component,
        allowance.enclosingFunction
      ),
      allowance
    );
  }
  for (const { input, sourceFile, aliases } of parseCanvasSources(files)) {
    if (
      aliases.size === CANVAS_COMPONENTS.size &&
      ![...CANVAS_COMPONENTS, 'LINEAR_SURFACE'].some(name =>
        input.source.includes(name)
      )
    ) {
      continue;
    }
    const surfaceAliases = linearSurfaceAliases(sourceFile);
    const createElementAliases = reactCreateElementAliases(sourceFile);
    const lineOf = (node: ts.Node): number =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const visit = (node: ts.Node, inherited = '<module>'): void => {
      const enclosingFunction = functionName(node, inherited);
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sourceFile);
        const component = aliases.get(tag);
        if (component) {
          if (
            shouldReportCanvasViolation(
              input.path,
              component,
              enclosingFunction,
              finalCanvasProps(node, sourceFile),
              remainingAllowances
            )
          ) {
            violations.push({
              path: input.path,
              line: lineOf(node),
              component,
              enclosingFunction,
              reason: 'unauthorized-occurrence',
            });
          }
        }
      }
      if (
        ts.isCallExpression(node) &&
        node.arguments[0] &&
        createElementAliases.has(unwrap(node.expression).getText(sourceFile))
      ) {
        const component = componentFromExpression(
          node.arguments[0],
          aliases,
          sourceFile
        );
        if (
          component &&
          shouldReportCanvasViolation(
            input.path,
            component,
            enclosingFunction,
            createElementCanvasProps(node.arguments[1]),
            remainingAllowances
          )
        ) {
          violations.push({
            path: input.path,
            line: lineOf(node),
            component,
            enclosingFunction,
            reason: 'unauthorized-occurrence',
          });
        }
      }
      if (
        input.path !== CANONICAL_CONTENT_PANEL_SOURCE &&
        rawContentContainerNode(node, surfaceAliases, sourceFile)
      ) {
        violations.push({
          path: input.path,
          line: lineOf(node),
          component: 'LINEAR_SURFACE.contentContainer',
          enclosingFunction,
          reason: 'unauthorized-occurrence',
        });
      }
      ts.forEachChild(node, child => visit(child, enclosingFunction));
    };
    visit(sourceFile);
  }
  for (const allowance of remainingAllowances.values()) {
    violations.push({
      path: allowance.source,
      line: 0,
      component: allowance.component,
      enclosingFunction: allowance.enclosingFunction,
      reason: 'unused-allowance',
    });
  }
  return violations;
}
