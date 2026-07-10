import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMonorepoRoot } from '@/lib/filesystem-paths';
import { compilePlaybookToSkill, getRegistryToolIds } from './compile';
import { validatePlaybookSource } from './schema';

const MONOREPO_ROOT = resolveMonorepoRoot();

function loadPlaybook(name: string): string {
  return readFileSync(join(MONOREPO_ROOT, 'docs', 'playbooks', name), 'utf-8');
}

function buildPlaybookSource(
  overrides: Record<string, unknown> = {},
  tools: string[] = ['analyzePackaging']
): string {
  const definition = {
    id: 'unit-compile-playbook',
    title: 'Unit Compile Playbook',
    version: '0.1.0',
    problemStatement: 'Need a reliable packaging audit.',
    triggerConditions: ['Artist connects YouTube'],
    requiredInputs: [{ name: 'channelId', description: 'YouTube channel id' }],
    steps: [
      {
        kind: 'tool_call',
        tool: tools[0],
        description: 'Analyze packaging',
      },
      {
        kind: 'prompt',
        description: 'Summarize fixes',
        prompt: 'List the top packaging fixes for {{channelId}}',
      },
    ],
    successMetric: {
      name: 'Watch minutes per impression',
      source: 'custom_event',
      eventName: 'youtube_watch_minutes_per_impression',
      direction: 'increase',
      window: '14d after run',
    },
    evalSeeds: [
      {
        name: 'healthy-channel',
        input: { channelId: 'UC_test' },
        expected: 'Produces ranked fix list',
      },
      {
        name: 'sparse-channel',
        input: { channelId: 'UC_empty' },
        expected: 'Degrades with clear empty-state guidance',
      },
    ],
    costEstimate: { credits: 2, notes: 'One tool + one prompt' },
    requiredTools: tools,
    requiredConnectors: ['youtube'],
    requiredEntitlements: ['aiCanUseTools'],
    ...overrides,
  };
  return `---\n${JSON.stringify(definition, null, 2)}\n---\n\n# Body\n`;
}

describe('compilePlaybookToSkill', () => {
  it('compiles a valid playbook to a draft skill', () => {
    const validated = validatePlaybookSource(buildPlaybookSource());
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const result = compilePlaybookToSkill(validated.definition);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.skill).toMatchObject({
      id: 'unit-compile-playbook',
      kind: 'vertical_agent',
      version: '0.1.0',
      lifecycle: 'draft',
      activeVersion: '0.1.0',
      entitlement: 'aiCanUseTools',
      promptPath: 'docs/playbooks/unit-compile-playbook.playbook.md',
    });
    expect(result.skill.metadata.successMetricSource).toBe('custom_event');
    expect(result.skill.metadata.evalSeedCount).toBe('2');
  });

  it('fails compile with unresolved-tool for unknown tools', () => {
    const validated = validatePlaybookSource(
      buildPlaybookSource({}, ['notARealTool'])
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const result = compilePlaybookToSkill(validated.definition);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.rule === 'unresolved-tool')).toBe(true);
    expect(result.errors[0]?.message).toContain('notARealTool');
  });

  it('recompile with a bumped version produces a new draft skill version', () => {
    const v1 = validatePlaybookSource(
      buildPlaybookSource({ version: '0.1.0' })
    );
    const v2 = validatePlaybookSource(
      buildPlaybookSource({ version: '0.2.0' })
    );
    expect(v1.ok && v2.ok).toBe(true);
    if (!v1.ok || !v2.ok) return;

    const skill1 = compilePlaybookToSkill(v1.definition);
    const skill2 = compilePlaybookToSkill(v2.definition);
    expect(skill1.ok && skill2.ok).toBe(true);
    if (!skill1.ok || !skill2.ok) return;

    expect(skill1.skill.version).toBe('0.1.0');
    expect(skill2.skill.version).toBe('0.2.0');
    expect(skill1.skill.id).toBe(skill2.skill.id);
    // Prior version retained as a separate SkillDefinition snapshot;
    // registration layer never mutates released version rows in place.
    expect(skill1.skill).not.toEqual(skill2.skill);
  });

  it('registry tool set includes analyzePackaging', () => {
    expect(getRegistryToolIds().has('analyzePackaging')).toBe(true);
  });
});

describe('compiled dogfood playbooks', () => {
  it.each([
    'jovie-youtube-channel-optimization.playbook.md',
    'jovie-dsp-content-audit.playbook.md',
  ])('%s validates and compiles to draft', fileName => {
    const raw = loadPlaybook(fileName);
    const validated = validatePlaybookSource(raw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      console.error(validated.errors);
      return;
    }
    const compiled = compilePlaybookToSkill(validated.definition);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      console.error(compiled.errors);
      return;
    }
    expect(compiled.skill.lifecycle).toBe('draft');
    expect(compiled.skill.kind).toBe('vertical_agent');
  });
});
