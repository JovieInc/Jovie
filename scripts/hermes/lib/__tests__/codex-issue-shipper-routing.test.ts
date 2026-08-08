import { describe, expect, it } from 'vitest';
import {
  buildAgentCommand,
  loadShipperConfig,
  selectTaskRoute,
  type GithubIssue,
} from '../codex-issue-shipper';

const issue = (title: string, labels: string[] = []): GithubIssue => ({
  number: 42,
  title,
  body: '',
  url: 'https://github.com/JovieInc/Jovie/issues/42',
  labels: labels.map(name => ({ name })),
});

describe('Codex shipper routing', () => {
  it('defaults Codex reasoning to max without changing the caller environment', () => {
    const config = loadShipperConfig(
      {
        HERMES_CODEX_SHIPPER_AGENT: 'codex',
        HERMES_CODEX_SHIPPER_SIMPLE_MODEL: 'gpt-5.6-luna',
        HERMES_CODEX_SHIPPER_STANDARD_MODEL: 'gpt-5.6-luna',
        HERMES_CODEX_SHIPPER_ESCALATION_MODEL: 'gpt-5.6-terra',
        HERMES_CODEX_SHIPPER_FALLBACK_MODEL: 'gpt-5.6-luna',
      },
      '/tmp/jovie',
      'JovieInc/Jovie'
    );

    expect(config.codexReasoningEffort).toBe('max');
    const route = selectTaskRoute(issue('Fix profile copy'), config);
    const command = buildAgentCommand(config, route);

    expect(route.sessionModel).toBe('gpt-5.6-luna');
    expect(command.args).toContain('model_reasoning_effort="max"');
  });

  it('uses the stronger model only for an explicitly high-risk route', () => {
    const config = loadShipperConfig(
      {
        HERMES_CODEX_SHIPPER_AGENT: 'codex',
        HERMES_CODEX_SHIPPER_SIMPLE_MODEL: 'gpt-5.6-luna',
        HERMES_CODEX_SHIPPER_STANDARD_MODEL: 'gpt-5.6-luna',
        HERMES_CODEX_SHIPPER_ESCALATION_MODEL: 'gpt-5.6-terra',
        HERMES_CODEX_SHIPPER_FALLBACK_MODEL: 'gpt-5.6-luna',
      },
      '/tmp/jovie',
      'JovieInc/Jovie'
    );

    expect(selectTaskRoute(issue('Fix copy'), config).sessionModel).toBe(
      'gpt-5.6-luna'
    );
    expect(
      selectTaskRoute(issue('Fix auth callback allow-list', ['security']), config)
        .sessionModel
    ).toBe('gpt-5.6-terra');
  });
});
