import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(process.cwd(), '../..');
const MEMORY_ADR_PATH = join(REPO_ROOT, 'docs/MEMORY_ADR.md');
const WEB_ROOT = join(REPO_ROOT, 'apps/web');

const REQUIRED_ADR_SECTIONS = [
  '## Decision',
  '## Scope',
  '## Context',
  '## Current file map',
  '## Forbidden couplings',
] as const;

const PRODUCT_MEMORY_PATHS = [
  'lib/memory',
  'lib/workflows/memory',
  'lib/agents/agent-harness.ts',
  'app/api/memory',
] as const;

const INTERNAL_AGENTOS_WDK_PATHS = [
  'workflows/agent-os-dry-run.ts',
  'lib/agent-os/workflows.ts',
] as const;

const FORBIDDEN_PRODUCT_IMPORT_MARKERS = [
  '@/workflows/agent-os-dry-run',
  '@/lib/agent-os/workflows',
  "from 'workflow'",
  'from "workflow"',
] as const;

const FORBIDDEN_AGENTOS_IMPORT_MARKERS = [
  '@/lib/memory',
  '@/lib/workflows/memory',
  '@/lib/agents/agent-harness',
] as const;

function collectSourceFiles(
  absoluteDir: string,
  relativePrefix: string
): string[] {
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(absoluteDir, entry.name);
    const relativePath = join(relativePrefix, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath, relativePath));
      continue;
    }

    if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      files.push(relativePath);
    }
  }

  return files;
}

function readBoundedSource(relativePath: string): string {
  const absolutePath = join(WEB_ROOT, relativePath);
  expect(existsSync(absolutePath), `${relativePath} missing`).toBe(true);
  return readFileSync(absolutePath, 'utf8');
}

function findForbiddenImports(
  source: string,
  markers: readonly string[]
): string[] {
  return markers.filter(marker => source.includes(marker));
}

describe('MEMORY ADR contract (JOV-2705)', () => {
  it('keeps docs/MEMORY_ADR.md present with required decision sections', () => {
    expect(existsSync(MEMORY_ADR_PATH)).toBe(true);

    const adr = readFileSync(MEMORY_ADR_PATH, 'utf8');
    expect(adr).toContain('Issue: JOV-2705');
    expect(adr).toContain('Internal AgentOS');
    expect(adr).toContain('Product memory workflows');
    expect(adr).toContain('WorkflowRunner');

    for (const section of REQUIRED_ADR_SECTIONS) {
      expect(adr, `missing ${section}`).toContain(section);
    }
  });

  it('links AgentOS architecture without collapsing the runtime split', () => {
    const agentOsAdrPath = join(REPO_ROOT, 'docs/AGENT_OS_ARCHITECTURE.md');
    expect(existsSync(agentOsAdrPath)).toBe(true);

    const agentOsAdr = readFileSync(agentOsAdrPath, 'utf8');
    expect(agentOsAdr).toContain('MEMORY_ADR.md');
    expect(agentOsAdr).toContain('JOV-2705');
  });

  it('blocks product memory modules from importing AgentOS WDK workflow code', () => {
    const violations: string[] = [];

    for (const root of PRODUCT_MEMORY_PATHS) {
      const absoluteRoot = join(WEB_ROOT, root);
      expect(existsSync(absoluteRoot), `${root} missing`).toBe(true);

      const files = statSync(absoluteRoot).isDirectory()
        ? collectSourceFiles(absoluteRoot, root)
        : [root];

      for (const file of files) {
        const forbidden = findForbiddenImports(
          readBoundedSource(file),
          FORBIDDEN_PRODUCT_IMPORT_MARKERS
        );
        if (forbidden.length > 0) {
          violations.push(
            `${file} imports forbidden AgentOS marker(s): ${forbidden.join(', ')}`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('blocks internal AgentOS WDK modules from importing product memory code', () => {
    const violations: string[] = [];

    for (const file of INTERNAL_AGENTOS_WDK_PATHS) {
      const forbidden = findForbiddenImports(
        readBoundedSource(file),
        FORBIDDEN_AGENTOS_IMPORT_MARKERS
      );
      if (forbidden.length > 0) {
        violations.push(
          `${file} imports forbidden product-memory marker(s): ${forbidden.join(', ')}`
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it('documents the guardrail beside the ADR for future editors', () => {
    const adr = readFileSync(MEMORY_ADR_PATH, 'utf8');
    const testPath = 'apps/web/tests/unit/memory/memory-adr-contract.test.ts';

    expect(adr).toContain(testPath);
    expect(relative(REPO_ROOT, MEMORY_ADR_PATH)).toBe('docs/MEMORY_ADR.md');
  });
});
