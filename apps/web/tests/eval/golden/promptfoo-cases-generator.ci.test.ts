import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import generateTests from './promptfoo-cases-generator';

interface JudgeConfig {
  providers: Array<{ id: string; label: string; config?: unknown }>;
}

describe('golden Promptfoo judge routing', () => {
  it('grades every golden case through the allowlisted Gateway provider', async () => {
    const config = parseYaml(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          '../../../promptfooconfig.judge.yaml'
        ),
        'utf8'
      )
    ) as JudgeConfig;
    const grader = config.providers.find(
      provider => provider.label === 'judge-grader'
    );
    expect(grader).toMatchObject({
      id: 'vercel:zai/glm-5.3-flash',
      config: { apiKeyEnvar: 'AI_GATEWAY_API_KEY' },
    });
    const tests = await generateTests({ lane: 'judge' });
    expect(tests.length).toBeGreaterThan(0);
    for (const test of tests) {
      expect(test.options?.provider).toEqual({
        id: grader?.id,
        config: grader?.config,
      });
      expect(test.assert).toContainEqual(
        expect.objectContaining({ type: 'llm-rubric', threshold: 0.75 })
      );
    }
  });

  it('keeps the deterministic lane free of model judges', async () => {
    const tests = await generateTests({ lane: 'deterministic' });
    expect(tests.length).toBeGreaterThan(0);
    for (const test of tests) {
      expect(test.options?.provider).toBeUndefined();
      expect(test.assert).toContainEqual(
        expect.objectContaining({ type: 'javascript' })
      );
    }
  });
});
