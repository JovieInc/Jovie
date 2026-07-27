import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface VariantSet {
  readonly variable: string;
  readonly path: readonly string[];
  readonly allowed: readonly string[];
}

interface TypeUnion {
  readonly name: string;
  readonly allowed: readonly string[];
}

interface StorybookContract {
  readonly file: string;
  readonly requiredExports: readonly string[];
}

interface StateContract {
  readonly id: string;
  readonly story?: string;
  readonly sourceMatch?: string;
}

interface ComponentContract {
  readonly id: string;
  readonly source: string;
  readonly owner: string;
  readonly semanticJob: string;
  readonly variantSets?: readonly VariantSet[];
  readonly typeUnions?: readonly TypeUnion[];
  readonly states: readonly StateContract[];
  readonly storybook?: StorybookContract;
  readonly testFile?: string;
}

interface ScanTarget {
  readonly path: string;
  readonly owner: string;
  readonly allowedImports: readonly string[];
}

interface ComplianceRule {
  readonly id: string;
  readonly pattern: string;
  readonly flags: string;
  readonly maxDebt: number;
}

interface ComplianceException {
  readonly rule: string;
  readonly file: string;
  readonly match: string;
  readonly maxOccurrences: number;
  readonly owner: string;
  readonly reason: string;
  readonly reviewTrigger: string;
}

interface ComplianceManifest {
  readonly version: number;
  readonly issue: string;
  readonly mode: 'forward-only';
  readonly scanTargets: readonly ScanTarget[];
  readonly components: readonly ComponentContract[];
  readonly rules: readonly ComplianceRule[];
  readonly exceptions: readonly ComplianceException[];
}

interface Finding {
  readonly rule: string;
  readonly file: string;
  readonly match: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const MANIFEST_PATH = join(
  __dirname,
  'launch-component-compliance.manifest.json'
);

function readManifest(): ComplianceManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ComplianceManifest;
}

function resolveRepoPath(path: string): string {
  return join(REPO_ROOT, path);
}

function propertyName(
  property: ts.ObjectLiteralElementLike
): string | undefined {
  if (!property.name) return undefined;
  if (
    ts.isIdentifier(property.name) ||
    ts.isStringLiteral(property.name) ||
    ts.isNumericLiteral(property.name)
  ) {
    return property.name.text;
  }
  return undefined;
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | undefined {
  const property = object.properties.find(
    candidate => propertyName(candidate) === name
  );
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined;
}

function findVariable(
  sourceFile: ts.SourceFile,
  name: string
): ts.VariableDeclaration | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const match = statement.declarationList.declarations.find(
      declaration =>
        ts.isIdentifier(declaration.name) && declaration.name.text === name
    );
    if (match) return match;
  }
  return undefined;
}

function extractVariantKeys(
  sourceFile: ts.SourceFile,
  contract: VariantSet
): readonly string[] {
  const declaration = findVariable(sourceFile, contract.variable);
  expect(
    declaration,
    `Missing variant source "${contract.variable}"`
  ).toBeDefined();
  expect(declaration?.initializer).toBeDefined();
  expect(ts.isCallExpression(declaration?.initializer as ts.Node)).toBe(true);

  const call = declaration?.initializer as ts.CallExpression;
  let current = call.arguments[1];
  expect(
    current && ts.isObjectLiteralExpression(current),
    `${contract.variable} must pass a literal CVA options object`
  ).toBe(true);

  for (const segment of contract.path) {
    current = objectProperty(current as ts.ObjectLiteralExpression, segment);
    expect(
      current && ts.isObjectLiteralExpression(current),
      `Missing ${contract.variable}.${contract.path.join('.')}`
    ).toBe(true);
  }

  return (current as ts.ObjectLiteralExpression).properties
    .map(propertyName)
    .filter((name): name is string => name !== undefined);
}

function extractStringUnion(
  sourceFile: ts.SourceFile,
  name: string
): readonly string[] {
  const alias = sourceFile.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === name
  ) as ts.TypeAliasDeclaration | undefined;
  expect(alias, `Missing type alias "${name}"`).toBeDefined();
  expect(alias && ts.isUnionTypeNode(alias.type)).toBe(true);

  return (alias?.type as ts.UnionTypeNode).types.map(type => {
    expect(ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)).toBe(
      true
    );
    return ((type as ts.LiteralTypeNode).literal as ts.StringLiteral).text;
  });
}

function exportedConstants(sourceFile: ts.SourceFile): ReadonlySet<string> {
  return new Set(
    sourceFile.statements.flatMap(statement => {
      if (
        !ts.isVariableStatement(statement) ||
        !statement.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        return [];
      }
      return statement.declarationList.declarations.flatMap(declaration =>
        ts.isIdentifier(declaration.name) ? [declaration.name.text] : []
      );
    })
  );
}

function staticImports(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap(statement => {
    const specifier =
      ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
        ? statement.moduleSpecifier
        : undefined;
    if (!specifier || !ts.isStringLiteral(specifier)) {
      return [];
    }
    return [specifier.text];
  });
}

function dynamicImports(sourceFile: ts.SourceFile): readonly string[] {
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      imports.push(node.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

function parseSource(path: string): ts.SourceFile {
  const file = resolveRepoPath(path);
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

function matchesFor(source: string, rule: ComplianceRule): readonly string[] {
  if (!rule.flags.includes('g')) {
    throw new Error(`${rule.id} must use the global RegExp flag`);
  }
  return Array.from(source.matchAll(new RegExp(rule.pattern, rule.flags))).map(
    match => match[0]
  );
}

function scan(manifest: ComplianceManifest): readonly Finding[] {
  return manifest.scanTargets.flatMap(target => {
    const source = readFileSync(resolveRepoPath(target.path), 'utf8');
    return manifest.rules.flatMap(rule =>
      matchesFor(source, rule).map(match => ({
        rule: rule.id,
        file: target.path,
        match,
      }))
    );
  });
}

function findingKey(finding: Finding): string {
  return `${finding.rule}\0${finding.file}\0${finding.match}`;
}

describe('launch component compliance manifest', () => {
  const manifest = readManifest();

  it('is a bootstrap-safe forward-only contract', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.issue).toMatch(/^JOV-\d+$/);
    expect(manifest.mode).toBe('forward-only');
    expect(
      new Set(manifest.components.map(component => component.id)).size
    ).toBe(manifest.components.length);
    expect(
      new Set(manifest.components.map(component => component.source)).size
    ).toBe(manifest.components.length);
    expect(new Set(manifest.scanTargets.map(target => target.path)).size).toBe(
      manifest.scanTargets.length
    );
    expect(new Set(manifest.rules.map(rule => rule.id)).size).toBe(
      manifest.rules.length
    );

    const scanTargetPaths = new Set(
      manifest.scanTargets.map(target => target.path)
    );
    for (const component of manifest.components) {
      expect(component.owner.trim()).not.toBe('');
      expect(component.semanticJob.trim()).not.toBe('');
      expect(component.states.length).toBeGreaterThan(0);
      expect(existsSync(resolveRepoPath(component.source))).toBe(true);
      expect(scanTargetPaths.has(component.source)).toBe(true);
    }

    for (const target of manifest.scanTargets) {
      expect(target.owner.trim()).not.toBe('');
      expect(existsSync(resolveRepoPath(target.path))).toBe(true);
      const source = parseSource(target.path);
      expect(
        [...staticImports(source)].sort(),
        `${target.path} changed its dependency surface; review and document the import before logic can sit outside the audited file`
      ).toEqual([...target.allowedImports].sort());
      expect(
        dynamicImports(source),
        `${target.path} cannot hide an unaudited dependency behind dynamic import()`
      ).toEqual([]);
    }
  });

  it('requires every debt exception to be owned, justified, and removable', () => {
    const ruleIds = new Set(manifest.rules.map(rule => rule.id));
    const targetOwners = new Map(
      manifest.scanTargets.map(target => [target.path, target.owner])
    );

    for (const exception of manifest.exceptions) {
      expect(ruleIds.has(exception.rule)).toBe(true);
      expect(targetOwners.has(exception.file)).toBe(true);
      expect(exception.match.trim()).not.toBe('');
      expect(exception.maxOccurrences).toBeGreaterThan(0);
      expect(exception.owner).toBe(targetOwners.get(exception.file));
      expect(exception.reason.trim()).not.toBe('');
      expect(exception.reviewTrigger.trim()).not.toBe('');
    }

    for (const rule of manifest.rules) {
      const documentedDebt = manifest.exceptions
        .filter(exception => exception.rule === rule.id)
        .reduce((total, exception) => total + exception.maxOccurrences, 0);
      expect(
        documentedDebt,
        `${rule.id} ceiling must equal its documented debt so no unused headroom can return`
      ).toBe(rule.maxDebt);
    }
  });

  it('allows only the exact documented debt in selected launch components', () => {
    const findings = scan(manifest);
    const allowed = new Map<string, number>();

    for (const exception of manifest.exceptions) {
      allowed.set(
        findingKey(exception),
        (allowed.get(findingKey(exception)) ?? 0) + exception.maxOccurrences
      );
    }

    const actual = new Map<string, number>();
    for (const finding of findings) {
      actual.set(
        findingKey(finding),
        (actual.get(findingKey(finding)) ?? 0) + 1
      );
    }

    const findingsAndExceptions = new Set([
      ...actual.keys(),
      ...allowed.keys(),
    ]);
    const violations = [...findingsAndExceptions]
      .filter(key => (actual.get(key) ?? 0) !== (allowed.get(key) ?? 0))
      .map(key => {
        const [rule, file, match] = key.split('\0');
        return `${rule} ${file}: "${match}" (${actual.get(key) ?? 0} found, ${allowed.get(key) ?? 0} documented)`;
      });

    expect(
      violations,
      'New debt is forbidden. When debt shrinks, lower or remove its bounded exception so the old ceiling cannot be reintroduced.'
    ).toEqual([]);
  });

  it('rejects representative new violations', () => {
    const examples: Record<string, readonly string[]> = {
      'raw-color': [
        '<div className="bg-[#fff] text-white" />',
        '<div className="divide-red-500 from-blue-500 accent-[#f00]" />',
        "<div style={{ backgroundColor: '#fff' }} />",
        '<div style={{ color: `rgb(255, 255, 255)` }} />',
      ],
      'arbitrary-shadow': [
        '<div className="shadow-[0_4px_20px_#000]" />',
        "<div style={{ boxShadow: '0 4px 20px #000' }} />",
        '<div style={{ boxShadow: `0 4px 20px #000` }} />',
      ],
      'raw-button-clone': ['<button type="button">Save</button>'],
      'local-loading-primitive': ['<Loader2 className="animate-spin" />'],
    };

    for (const rule of manifest.rules) {
      const fixtures = examples[rule.id];
      expect(
        fixtures?.length ?? 0,
        `${rule.id} must ship at least one regression fixture`
      ).toBeGreaterThan(0);
      for (const example of fixtures ?? []) {
        expect(
          matchesFor(example, rule).length,
          `${rule.id} must detect its regression fixture`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps documented component variants and state evidence exact', () => {
    for (const component of manifest.components) {
      const source = parseSource(component.source);
      const sourceText = source.getFullText();
      const stateIds = component.states.map(state => state.id);
      expect(new Set(stateIds).size).toBe(stateIds.length);
      for (const state of component.states) {
        if (state.story !== undefined) {
          expect(state.story.trim()).not.toBe('');
          expect(
            component.storybook,
            `${component.id}.${state.id} declares a story proof without a Storybook contract`
          ).toBeDefined();
        }
        if (state.sourceMatch !== undefined) {
          expect(state.sourceMatch.trim()).not.toBe('');
        }
      }

      for (const variantSet of component.variantSets ?? []) {
        expect(extractVariantKeys(source, variantSet)).toEqual(
          variantSet.allowed
        );
      }

      for (const union of component.typeUnions ?? []) {
        expect(extractStringUnion(source, union.name)).toEqual(union.allowed);
      }

      if (component.storybook) {
        expect(existsSync(resolveRepoPath(component.storybook.file))).toBe(
          true
        );
        const exports = exportedConstants(
          parseSource(component.storybook.file)
        );
        expect(
          component.storybook.requiredExports.filter(
            name => !exports.has(name)
          ),
          `${component.id} Storybook state matrix is missing required exports`
        ).toEqual([]);

        for (const state of component.states.filter(
          state => state.story !== undefined
        )) {
          expect(
            exports.has(state.story as string),
            `${component.id}.${state.id} must resolve to Storybook export "${state.story}"`
          ).toBe(true);
        }
      }

      for (const state of component.states.filter(
        state => state.sourceMatch !== undefined
      )) {
        expect(
          sourceText.includes(state.sourceMatch as string),
          `${component.id}.${state.id} must resolve to its source capability`
        ).toBe(true);
      }

      for (const state of component.states) {
        expect(
          Number(state.story !== undefined) +
            Number(state.sourceMatch !== undefined),
          `${component.id}.${state.id} must declare exactly one enforceable state proof`
        ).toBe(1);
      }

      if (component.testFile) {
        expect(existsSync(resolveRepoPath(component.testFile))).toBe(true);
      }
    }
  });
});
