import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppWebRoot, resolveMonorepoRoot } from '@/lib/filesystem-paths';
import {
  MIN_EVAL_SEEDS,
  parsePlaybookFrontmatter,
  validatePlaybookSource,
} from '@/lib/playbooks/schema';

const MONOREPO_ROOT = resolveMonorepoRoot();
const APP_WEB_ROOT = resolveAppWebRoot();

const WORKED_EXAMPLE = readFileSync(
  join(
    MONOREPO_ROOT,
    'docs',
    'playbooks',
    'release-day-announcement.playbook.md'
  ),
  'utf-8'
);

const INVALID_FIXTURE = readFileSync(
  join(
    APP_WEB_ROOT,
    'tests',
    'fixtures',
    'playbooks',
    'invalid-multiple-violations.playbook.md'
  ),
  'utf-8'
);

function buildValidSource(
  overrides: Record<string, unknown> = {}
): string {
  const definition = {
    id: 'unit-test-playbook',
    title: 'Unit Test Playbook',
    version: '0.1.0',
    problemStatement: 'A problem stated in user terms.',
    triggerConditions: ['a trigger'],
    requiredInputs: [{ name: 'releaseId', description: 'The release' }],
    steps: [
      {
        kind: 'tool_call',
        tool: 'smart_link_switch_live',
        description: 'Flip the link',
      },
    ],
    successMetric: {
      name: 'Clicks',
      source: 'smart_link_clicks',
      direction: 'increase',
      window: '48h after run',
    },
    evalSeeds: [
      { name: 'case-1', input: {}, expected: 'works' },
      { name: 'case-2', input: {}, expected: 'still works' },
    ],
    costEstimate: { credits: 1 },
    requiredTools: ['smart_link_switch_live'],
    requiredConnectors: [],
    requiredEntitlements: [],
    ...overrides,
  };
  return `---\n${JSON.stringify(definition, null, 2)}\n---\n\n# Body\n`;
}

describe('docs/playbooks sweep', () => {
  // Mirrors scripts/validate-playbooks.ts so the unit-test CI lane enforces
  // the contract for every committed playbook file.
  const playbooksDir = join(MONOREPO_ROOT, 'docs', 'playbooks');
  const playbookFiles = readdirSync(playbooksDir).filter(name =>
    name.endsWith('.playbook.md')
  );

  it('has at least the worked example', () => {
    expect(playbookFiles.length).toBeGreaterThanOrEqual(1);
  });

  it.each(playbookFiles)('%s passes the validator', file => {
    const raw = readFileSync(join(playbooksDir, file), 'utf-8');
    const result = validatePlaybookSource(raw);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) {
      expect(`${result.definition.id}.playbook.md`).toBe(file);
    }
  });
});

describe('parsePlaybookFrontmatter', () => {
  it('splits frontmatter and body', () => {
    const { frontmatter, body } = parsePlaybookFrontmatter(
      '---\n{"a":1}\n---\n\nbody text\n'
    );
    expect(frontmatter).toBe('{"a":1}');
    expect(body).toContain('body text');
  });

  it('returns null frontmatter when the block is missing', () => {
    const { frontmatter } = parsePlaybookFrontmatter('# just markdown\n');
    expect(frontmatter).toBeNull();
  });
});

describe('validatePlaybookSource', () => {
  it('accepts the committed worked example', () => {
    const result = validatePlaybookSource(WORKED_EXAMPLE);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) {
      expect(result.definition.id).toBe('release-day-announcement');
      expect(result.definition.evalSeeds.length).toBeGreaterThanOrEqual(
        MIN_EVAL_SEEDS
      );
    }
  });

  it('accepts a minimal valid definition', () => {
    const result = validatePlaybookSource(buildValidSource());
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it('fails the intentionally-invalid fixture with named rules', () => {
    const result = validatePlaybookSource(INVALID_FIXTURE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const rules = result.errors.map(error => error.rule);
      expect(rules).toContain('missing-eval-seeds');
      expect(rules).toContain('unmeasurable-success-metric');
      expect(rules).toContain('undeclared-tool-deps');
    }
  });

  it('names missing-frontmatter when no frontmatter block exists', () => {
    const result = validatePlaybookSource('# no frontmatter here\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].rule).toBe('missing-frontmatter');
    }
  });

  it('names invalid-frontmatter-json for malformed JSON', () => {
    const result = validatePlaybookSource('---\n{not json\n---\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].rule).toBe('invalid-frontmatter-json');
    }
  });

  it('names invalid-schema with a path for missing fields', () => {
    const result = validatePlaybookSource(
      buildValidSource({ problemStatement: undefined })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].rule).toBe('invalid-schema');
      expect(result.errors.some(e => e.path === 'problemStatement')).toBe(
        true
      );
    }
  });

  it('flags fewer than MIN_EVAL_SEEDS seeds', () => {
    const result = validatePlaybookSource(
      buildValidSource({
        evalSeeds: [{ name: 'only', input: {}, expected: 'x' }],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(e => e.rule)).toContain('missing-eval-seeds');
    }
  });

  it('flags custom_event metrics without an eventName', () => {
    const result = validatePlaybookSource(
      buildValidSource({
        successMetric: {
          name: 'Custom',
          source: 'custom_event',
          direction: 'increase',
          window: '7d',
        },
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(e => e.rule)).toContain(
        'unmeasurable-success-metric'
      );
    }
  });

  it('accepts custom_event metrics with an eventName', () => {
    const result = validatePlaybookSource(
      buildValidSource({
        successMetric: {
          name: 'Custom',
          source: 'custom_event',
          eventName: 'playbook_custom_outcome',
          direction: 'increase',
          window: '7d',
        },
      })
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it('flags tool_call steps whose tool is not declared', () => {
    const result = validatePlaybookSource(
      buildValidSource({ requiredTools: [] })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error = result.errors.find(
        e => e.rule === 'undeclared-tool-deps'
      );
      expect(error).toBeDefined();
      expect(error?.path).toBe('steps[0].tool');
    }
  });
});
