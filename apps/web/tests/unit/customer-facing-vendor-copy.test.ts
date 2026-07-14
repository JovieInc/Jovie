import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CUSTOMER_FACING_COPY_FILES = [
  'components/features/auth/AuthUnavailableCard.tsx',
  'app/desktop-auth/page.tsx',
  'app/(auth)/auth/native-complete/page.tsx',
  'components/features/dashboard/organisms/account-settings/AccountSettingsSection.tsx',
  'components/features/dashboard/organisms/account-settings/utils.ts',
  '../desktop/src/main.ts',
] as const;

const FORBIDDEN_INTERNAL_VENDOR_TERMS = [
  'Electron',
  'Clerk',
  'Capacitor',
  'React Native',
] as const;

function extractCustomerFacingStrings(
  source: string,
  fileName: string
): readonly string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const values: string[] = [];

  function addValue(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length > 0) {
      values.push(normalized);
    }
  }

  function visit(node: ts.Node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      addValue(node.text);
    } else if (ts.isTemplateExpression(node)) {
      addValue(node.head.text);
      for (const span of node.templateSpans) {
        addValue(span.literal.text);
      }
    } else if (ts.isJsxText(node)) {
      addValue(node.getText(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

describe('customer-facing vendor copy', () => {
  it('does not expose internal vendor/runtime names in customer-facing strings', () => {
    const offenders = CUSTOMER_FACING_COPY_FILES.flatMap(file => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      return extractCustomerFacingStrings(source, file).flatMap(value =>
        FORBIDDEN_INTERNAL_VENDOR_TERMS.filter(term =>
          value.includes(term)
        ).map(term => ({ file, term, value }))
      );
    });

    expect(offenders).toEqual([]);
  });
});
