import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, relativePath), 'utf8');
}

function valueImportSpecifiers(code: string): string[] {
  const withoutTypeImports = code.replace(
    /^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm,
    ''
  );
  return [
    ...withoutTypeImports.matchAll(
      /^\s*import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"];?/gm
    ),
  ].map(match => match[1] ?? '');
}

describe('source inspection first-load split', () => {
  it('keeps shell markdown from statically importing the source card graph', () => {
    const specifiers = valueImportSpecifiers(
      source('components/ChatMarkdown.tsx')
    );
    expect(specifiers).not.toContain('./SourceEvidence');
    expect(source('components/ChatMarkdown.tsx')).toContain(
      "import('./SourceEvidence')"
    );
  });

  it('keeps the admin transcript from statically importing Zod enrichment', () => {
    expect(
      valueImportSpecifiers(source('JovieChatSections.tsx'))
    ).not.toContain('./source-facts');
    expect(source('JovieChatSections.tsx')).toContain(
      "import('./source-facts')"
    );
    expect(
      valueImportSpecifiers(source('components/ChatMessage.tsx'))
    ).not.toContain('./SourceEvidence');
    expect(
      valueImportSpecifiers(source('components/EntityChipPopover.tsx'))
    ).not.toContain('@/lib/profile-facts/enrichment');
    expect(
      valueImportSpecifiers(source('components/EntityChipPopover.tsx'))
    ).not.toContain('./SourceFactCard');
    expect(
      valueImportSpecifiers(source('source-fact-labels.ts'))
    ).not.toContain('@/lib/profile-facts/enrichment');
    expect(
      valueImportSpecifiers(source('source-evidence-context.ts'))
    ).not.toContain('@/lib/profile-facts/enrichment');
    expect(
      valueImportSpecifiers(source('components/SourceEvidence.tsx'))
    ).not.toContain('@/lib/profile-facts/enrichment');
    expect(
      valueImportSpecifiers(source('components/SourceEvidence.tsx'))
    ).not.toContain('../source-facts');
  });
});
