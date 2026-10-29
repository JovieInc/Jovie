import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, relativePath), 'utf8');
}

function valueImports(relativePath: string): string[] {
  const code = source(relativePath).replace(
    /^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm,
    ''
  );
  return [
    ...code.matchAll(
      /^\s*import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"];?/gm
    ),
  ].map(match => match[1] ?? '');
}

describe('source inspection first-load split', () => {
  it('loads the card graph and Zod projection after first paint', () => {
    expect(valueImports('components/ChatMarkdown.tsx')).not.toContain(
      './SourceEvidence'
    );
    expect(source('components/ChatMarkdown.tsx')).toContain(
      "import('./SourceEvidence')"
    );
    expect(valueImports('JovieChatSections.tsx')).not.toContain(
      './source-facts'
    );
    expect(source('JovieChatSections.tsx')).toContain(
      "import('./source-facts')"
    );
    const forbidden = [
      ['components/ChatMessage.tsx', './SourceEvidence'],
      ['components/EntityChipPopover.tsx', '@/lib/profile-facts/enrichment'],
      ['components/EntityChipPopover.tsx', './SourceFactCard'],
      ['source-fact-labels.ts', '@/lib/profile-facts/enrichment'],
      ['source-evidence-context.ts', '@/lib/profile-facts/enrichment'],
      ['components/SourceEvidence.tsx', '@/lib/profile-facts/enrichment'],
      ['components/SourceEvidence.tsx', '../source-facts'],
    ] as const;
    for (const [file, specifier] of forbidden) {
      expect(valueImports(file)).not.toContain(specifier);
    }
  });
});
