#!/usr/bin/env node
/** Zero-allowance marketing material boundary. JOV-8927. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const PRIMITIVE = 'styles/primitives/glass.css';
export const SCAN_ROOTS = [
  'app/(home)',
  'app/(marketing)',
  'components/homepage',
  'components/marketing',
  'components/site',
  'components/organisms/HeaderNav.css',
  'components/organisms/HeaderNav.tsx',
];

// Explicit task boundary: the hero-light owner must remain untouched. Footer
// files are scanned normally, even though this migration does not edit them.
export function isMarketingSource(path) {
  return (
    SCAN_ROOTS.some(root => path === root || path.startsWith(`${root}/`)) &&
    !path.startsWith('components/homepage/hero-light/') &&
    /\.(?:css|scss|[cm]?[jt]sx?)$/.test(path) &&
    !/\.(?:test|spec|stories)\./.test(path)
  );
}

const backdrop = /backdrop(?:-|_)?(?:blur|filter)/i;
function forbiddenGlass(value) {
  return value.split(/\s+/).some(token => {
    // These are presentation identifiers and structural header hooks, not
    // independent materials. Their backdrop declarations are still forbidden.
    if (/^(?:.*:)?ds-glass$/.test(token)) return false;
    if (/^marketing-glass-header(?:__[a-z-]+)?$/.test(token)) return false;
    return /(?:^|:)[\w-]*glass[\w-]*(?:$|\/)/i.test(token);
  });
}

export function findViolations(path, source) {
  if (!isMarketingSource(path)) return [];
  // Most marketing files contain neither concept. Avoid parsing their ASTs.
  if (!/backdrop(?:-|_)?(?:blur|filter)|glass/i.test(source)) return [];
  const violations = [];
  const report = (offset, reason) => {
    const line = source.slice(0, offset).split('\n').length;
    violations.push({ path, line, reason });
  };
  if (/\.(?:css|scss)$/.test(path)) {
    // Preserve offsets so diagnostics remain useful after multiline comments.
    const css = source.replace(/\/\*[\s\S]*?\*\//g, comment =>
      comment.replace(/[^\n]/g, ' ')
    );
    for (const match of css.matchAll(/backdrop(?:-|_)?(?:blur|filter)/gi)) {
      report(
        match.index,
        'backdrop effects belong only to the glass primitive'
      );
    }
    for (const match of css.matchAll(/\.([\w-]*glass[\w-]*)/gi)) {
      if (match[1] === 'ds-glass' || forbiddenGlass(match[1])) {
        report(
          match.index,
          'glass material classes must be owned by the primitive'
        );
      }
    }
  } else {
    const ast = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const visit = node => {
      const isText =
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node);
      if (isText || ts.isIdentifier(node)) {
        const value = node.text;
        const recipeId = value === 'dark-glass' || value === 'marketing-glass';
        let recipeContext = ts.isLiteralTypeNode(node.parent);
        let owner = node.parent;
        while (recipeId && owner && !ts.isSourceFile(owner)) {
          if (
            ts.isVariableDeclaration(owner) &&
            /^(?:variant|presentation)$/.test(owner.name.getText(ast))
          )
            recipeContext = true;
          if (
            ts.isJsxAttribute(owner) &&
            /^(?:data-)?(?:variant|presentation)$/.test(owner.name.getText(ast))
          )
            recipeContext = true;
          if (
            ts.isBinaryExpression(owner) &&
            [
              ts.SyntaxKind.EqualsEqualsEqualsToken,
              ts.SyntaxKind.ExclamationEqualsEqualsToken,
            ].includes(owner.operatorToken.kind)
          )
            recipeContext = true;
          owner = owner.parent;
        }
        if (backdrop.test(value)) {
          report(
            node.getStart(ast),
            'use ds-glass instead of backdrop utilities or inline filters'
          );
        } else if (
          isText &&
          forbiddenGlass(value) &&
          !(recipeId && recipeContext)
        ) {
          report(
            node.getStart(ast),
            'use ds-glass instead of ad-hoc glass classes'
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return violations;
}

export function scanMarketingGlass(webRoot) {
  const violations = [];
  const scan = path => {
    const absolute = join(webRoot, path);
    if (statSync(absolute).isFile()) {
      violations.push(...findViolations(path, readFileSync(absolute, 'utf8')));
      return;
    }
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) scan(child);
      else if (isMarketingSource(child)) scan(child);
    }
  };
  for (const root of SCAN_ROOTS) scan(root);
  return violations;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const violations = scanMarketingGlass(webRoot);
  for (const { path, line, reason } of violations) {
    console.error(
      `${relative(process.cwd(), join(webRoot, path))}:${line}: ${reason}`
    );
  }
  if (violations.length) process.exitCode = 1;
  else
    console.log('Marketing glass: zero violations (sanctioned ds-glass only).');
}
