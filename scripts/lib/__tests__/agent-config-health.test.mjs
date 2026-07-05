import { describe, expect, it } from 'vitest';

import {
  buildAgentConfigHealthBrief,
  parseHermesFallbackProviders,
  validateHermesConfigText,
  validateOpenClawConfig,
} from '../../hermes/jobs/agent-config-health.ts';

describe('parseHermesFallbackProviders', () => {
  it('parses fallback provider entries from the Hermes config', () => {
    expect(
      parseHermesFallbackProviders(`
provider: openrouter
model: deepseek/deepseek-r1:free
fallback_providers:
  - provider: openrouter
    model: deepseek/deepseek-r1:free
  - provider: ollama
    model: qwen3:4b-q4_K_M
`)
    ).toEqual([
      { line: 5, provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
      { line: 7, provider: 'ollama', model: 'qwen3:4b-q4_K_M' },
    ]);
  });
});

describe('validateHermesConfigText', () => {
  it('rejects the known broken nex-agi fallback variants', () => {
    const findings = validateHermesConfigText(`
fallback_providers:
  - provider: openrouter
    model: nex-agi/nex-n2-pro:free
  - provider: openrouter
    model: nex-agi/nex-n2-pro-free
`);

    expect(findings.map(finding => finding.code)).toEqual([
      'hermes_broken_fallback_model',
      'hermes_broken_fallback_model',
      'hermes_paid_openrouter_fallback',
    ]);
  });

  it('rejects paid OpenRouter fallbacks but accepts local Ollama fallback', () => {
    const findings = validateHermesConfigText(`
fallback_providers:
  - provider: openrouter
    model: nvidia/nemotron-3-super-120b-a12b
  - provider: ollama
    model: qwen3:4b-q4_K_M
`);

    expect(findings).toEqual([
      expect.objectContaining({
        code: 'hermes_paid_openrouter_fallback',
        path: 'fallback_providers[line 3].model',
        severity: 'error',
      }),
    ]);
  });
});

describe('validateOpenClawConfig', () => {
  it('accepts the current OpenClaw memorySearch schema for Vercel AI Gateway', () => {
    const findings = validateOpenClawConfig({
      agents: {
        defaults: {
          memorySearch: {
            provider: 'openai-compatible',
            remote: {
              baseUrl: 'https://ai-gateway.vercel.sh',
            },
            model: 'openai/text-embedding-3-small',
            fallback: 'none',
          },
        },
      },
    });

    expect(findings).toEqual([]);
  });

  it('flags the schema clobber that prevents OpenClaw gateway startup', () => {
    const findings = validateOpenClawConfig({
      agents: {
        defaults: {
          memorySearch: {
            provider: 'openai',
            remote: {
              baseUrl: 'https://ai-gateway.vercel.sh',
              apiKey: { env: 'AI_GATEWAY_API_KEY' },
            },
            model: 'text-embedding-3-small',
            fallback: 'none',
          },
        },
        list: [
          { id: 'main' },
          {
            id: 'summer',
            memorySearch: {
              provider: 'openai',
              remote: {
                baseUrl: 'https://ai-gateway.vercel.sh',
                apiKey: { env: 'AI_GATEWAY_API_KEY' },
              },
              model: 'text-embedding-3-small',
            },
          },
        ],
      },
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'openclaw_memory_search_env_api_key',
          path: 'agents.defaults.memorySearch.remote.apiKey',
        }),
        expect.objectContaining({
          code: 'openclaw_memory_search_provider',
          path: 'agents.defaults.memorySearch.provider',
        }),
        expect.objectContaining({
          code: 'openclaw_memory_search_model_prefix',
          path: 'agents.defaults.memorySearch.model',
        }),
        expect.objectContaining({
          code: 'openclaw_memory_search_env_api_key',
          path: 'agents.list[1].memorySearch.remote.apiKey',
        }),
      ])
    );
    expect(
      findings.filter(finding => finding.severity === 'error')
    ).toHaveLength(6);
  });
});

describe('buildAgentConfigHealthBrief', () => {
  it('GH #13123: sends Tim the human message, not the raw file/path/code jargon', () => {
    const brief = buildAgentConfigHealthBrief([
      {
        severity: 'error',
        file: 'hermes',
        path: 'fallback_providers[line 4].model',
        code: 'hermes_broken_fallback_model',
        message:
          'Hermes fallback model nex-agi/nex-n2-pro is a known broken global fallback for local agents.',
      },
    ]);

    expect(brief).toContain(
      '1. Hermes fallback model nex-agi/nex-n2-pro is a known broken global fallback for local agents.'
    );
    expect(brief).toContain('Reply: Do this / Skip / Defer');
    // Neither the raw code/path pair nor the bracket-index YAML path may
    // appear next to the problem/action lines — only in the Refs footer.
    const actionLine = brief
      .split('\n')
      .find(line => line.trim().startsWith('Action:'));
    expect(actionLine).not.toContain('fallback_providers[line 4]');
    expect(brief).not.toContain(
      'hermes:fallback_providers[line 4].model hermes_broken_fallback_model'
    );
    expect(brief).toContain(
      'Refs: hermes_broken_fallback_model (fallback_providers[line 4].model)'
    );
  });

  it('caps at 3 issues and defers the rest instead of dumping a wall of codes', () => {
    const errors = Array.from({ length: 5 }, (_, i) => ({
      severity: 'error',
      file: 'hermes',
      path: `fallback_providers[line ${i}].model`,
      code: `code-${i}`,
      message: `Problem number ${i}.`,
    }));

    const brief = buildAgentConfigHealthBrief(errors);

    expect(brief).toContain('1. Problem number 0.');
    expect(brief).toContain('3. Problem number 2.');
    expect(brief).not.toContain('4. Problem number 3.');
    expect(brief).toContain('(+2 more deferred — reply "more" to see them.)');
  });

  it('uses singular grammar in the title for exactly one issue', () => {
    const brief = buildAgentConfigHealthBrief([
      {
        severity: 'error',
        file: 'hermes',
        path: 'fallback_providers[line 0].model',
        code: 'code-0',
        message: 'Problem number 0.',
      },
    ]);

    expect(brief).toContain('Hermes agent config: 1 issue needs a look');
  });
});
