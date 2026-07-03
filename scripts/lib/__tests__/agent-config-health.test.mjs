import { describe, expect, it } from 'vitest';

import {
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
