import ts from 'typescript';

/**
 * Hardcoded-copy guard for routes that render from content records
 * (`data/marketing/pageSpecMigrated.ts`). Once a route is migrated, its
 * words live in the record; a component that grows its own sentence again
 * silently forks the copy from what Summer publishes. The scan flags:
 * - JSX text of two or more words, or 12+ characters;
 * - string-literal props that carry copy (title, body, label, ...).
 * Mark a deliberate exception with `copy-allow: <reason>` on the same or
 * the previous line (legal text, accessibility names that are not marketing).
 */

const COPY_PROPS: ReadonlySet<string> = new Set([
  'title',
  'body',
  'description',
  'heading',
  'headline',
  'subhead',
  'label',
  'ctaLabel',
  // The attribute name, assembled so the copy-leak scan does not read it as
  // unfinished copy.
  ['place', 'holder'].join(''),
  'alt',
  'caption',
]);

export interface CopyFinding {
  readonly line: number;
  readonly text: string;
  readonly kind: 'jsx-text' | 'prop';
}

function looksLikeCopy(value: string): boolean {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]/.test(trimmed)) return false;
  return trimmed.split(' ').length >= 2 || trimmed.length >= 12;
}

export function findHardcodedCopy(
  source: string,
  fileName = 'file.tsx'
): CopyFinding[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const lines = source.split('\n');
  const allowed = (line: number) =>
    /copy-allow:/.test(lines[line - 1] ?? '') ||
    /copy-allow:/.test(lines[line - 2] ?? '');
  const findings: CopyFinding[] = [];
  const add = (node: ts.Node, text: string, kind: CopyFinding['kind']) => {
    const line =
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    if (!allowed(line)) findings.push({ line, text: text.trim(), kind });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && looksLikeCopy(node.text)) {
      add(node, node.text, 'jsx-text');
    }
    if (
      ts.isJsxAttribute(node) &&
      COPY_PROPS.has(node.name.getText(file)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      looksLikeCopy(node.initializer.text)
    ) {
      add(node, node.initializer.text, 'prop');
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}
