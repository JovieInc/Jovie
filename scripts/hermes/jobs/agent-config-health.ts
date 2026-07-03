#!/usr/bin/env tsx
/**
 * Agent Config Health — Hermes-Air
 *
 * Guards the local agent control plane against config drift found in
 * Telegram/OpenClaw incidents: stale Hermes model fallbacks and invalid
 * OpenClaw memorySearch schema rewrites.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendTelegram } from '../lib/telegram-client';

const JOB = 'agent-config-health';
const VERCEL_AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh';
const BROKEN_FALLBACK_MODELS = new Set([
  'nex-agi/nex-n2-pro:free',
  'nex-agi/nex-n2-pro-free',
]);

export interface ConfigFinding {
  readonly severity: 'error' | 'warning';
  readonly file: 'hermes' | 'openclaw';
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface AgentConfigHealthResult {
  readonly findings: ConfigFinding[];
  readonly checked: {
    readonly hermesConfigPath: string;
    readonly openClawConfigPath: string;
  };
}

interface HermesFallbackProvider {
  readonly provider?: string;
  readonly model?: string;
  readonly line: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pathFor(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

function cleanYamlScalar(value: string): string {
  return value
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function parseYamlKeyValue(
  text: string
): { key: string; value: string } | null {
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
  if (!match) return null;
  return { key: match[1], value: cleanYamlScalar(match[2]) };
}

export function parseHermesFallbackProviders(
  yamlText: string
): HermesFallbackProvider[] {
  const providers: HermesFallbackProvider[] = [];
  const lines = yamlText.split(/\r?\n/);
  let inFallbackBlock = false;
  let blockIndent = 0;
  let current: { provider?: string; model?: string; line: number } | null =
    null;

  const pushCurrent = (): void => {
    if (current) providers.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index].replace(/\t/g, '  ');
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;

    if (!inFallbackBlock) {
      const fallbackMatch = rawLine.match(/^(\s*)fallback_providers\s*:/);
      if (fallbackMatch) {
        inFallbackBlock = true;
        blockIndent = fallbackMatch[1].length;
      }
      continue;
    }

    if (indent <= blockIndent && !trimmed.startsWith('-')) {
      break;
    }

    if (trimmed.startsWith('-')) {
      pushCurrent();
      current = { line: index + 1 };
      const inline = trimmed.slice(1).trim();
      const pair = parseYamlKeyValue(inline);
      if (pair && (pair.key === 'provider' || pair.key === 'model')) {
        current[pair.key] = pair.value;
      }
      continue;
    }

    if (!current) continue;
    const pair = parseYamlKeyValue(trimmed);
    if (pair && (pair.key === 'provider' || pair.key === 'model')) {
      current[pair.key] = pair.value;
    }
  }

  pushCurrent();
  return providers;
}

export function validateHermesConfigText(yamlText: string): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  for (const provider of parseHermesFallbackProviders(yamlText)) {
    const providerName = provider.provider?.toLowerCase();
    const model = provider.model?.toLowerCase();
    const normalizedModel = model?.replace(/:/g, '-');
    const path = `fallback_providers[line ${provider.line}]`;

    if (!providerName || !model) {
      findings.push({
        severity: 'warning',
        file: 'hermes',
        path,
        code: 'hermes_fallback_incomplete',
        message: 'Hermes fallback provider is missing provider or model.',
      });
      continue;
    }

    if (model && BROKEN_FALLBACK_MODELS.has(model)) {
      findings.push({
        severity: 'error',
        file: 'hermes',
        path: `${path}.model`,
        code: 'hermes_broken_fallback_model',
        message:
          'Hermes fallback model nex-agi/nex-n2-pro is a known broken global fallback for local agents.',
      });
    } else if (normalizedModel && BROKEN_FALLBACK_MODELS.has(normalizedModel)) {
      findings.push({
        severity: 'error',
        file: 'hermes',
        path: `${path}.model`,
        code: 'hermes_broken_fallback_model',
        message:
          'Hermes fallback model nex-agi/nex-n2-pro is a known broken global fallback for local agents.',
      });
    }

    if (providerName === 'openrouter' && !model.endsWith(':free')) {
      findings.push({
        severity: 'error',
        file: 'hermes',
        path: `${path}.model`,
        code: 'hermes_paid_openrouter_fallback',
        message:
          'OpenRouter Hermes fallbacks must be explicitly free models; use a :free model or local Ollama fallback.',
      });
    }
  }
  return findings;
}

function validateMemorySearch(
  memorySearch: unknown,
  path: string
): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  if (!isRecord(memorySearch)) {
    findings.push({
      severity: 'error',
      file: 'openclaw',
      path,
      code: 'openclaw_memory_search_shape',
      message: 'OpenClaw memorySearch must be an object.',
    });
    return findings;
  }

  const remote = isRecord(memorySearch.remote) ? memorySearch.remote : null;
  const provider =
    typeof memorySearch.provider === 'string' ? memorySearch.provider : null;
  const model =
    typeof memorySearch.model === 'string' ? memorySearch.model : null;
  const baseUrl =
    remote && typeof remote.baseUrl === 'string' ? remote.baseUrl : null;
  const apiKey = remote ? remote.apiKey : undefined;

  if (isRecord(apiKey)) {
    findings.push({
      severity: 'error',
      file: 'openclaw',
      path: `${path}.remote.apiKey`,
      code: 'openclaw_memory_search_env_api_key',
      message:
        'OpenClaw memorySearch remote.apiKey cannot be an {env: ...} object in the current gateway schema.',
    });
  }

  if (baseUrl === VERCEL_AI_GATEWAY_URL && provider !== 'openai-compatible') {
    findings.push({
      severity: 'error',
      file: 'openclaw',
      path: `${path}.provider`,
      code: 'openclaw_memory_search_provider',
      message:
        'OpenClaw memorySearch through Vercel AI Gateway must use provider openai-compatible.',
    });
  }

  if (baseUrl === VERCEL_AI_GATEWAY_URL && model === 'text-embedding-3-small') {
    findings.push({
      severity: 'error',
      file: 'openclaw',
      path: `${path}.model`,
      code: 'openclaw_memory_search_model_prefix',
      message:
        'OpenClaw memorySearch through Vercel AI Gateway must use openai/text-embedding-3-small.',
    });
  }

  return findings;
}

export function validateOpenClawConfig(config: unknown): ConfigFinding[] {
  const findings: ConfigFinding[] = [];

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, pathFor(path, index)));
      return;
    }
    if (!isRecord(value)) return;

    for (const [key, child] of Object.entries(value)) {
      const childPath = pathFor(path, key);
      if (key === 'memorySearch') {
        findings.push(...validateMemorySearch(child, childPath));
      }
      visit(child, childPath);
    }
  };

  visit(config, '');
  return findings;
}

function defaultOpenClawConfigPath(): string {
  const home = process.env.OPENCLAW_HOME ?? join(homedir(), '.openclaw');
  return process.env.OPENCLAW_CONFIG ?? join(home, 'openclaw.json');
}

function readOpenClawConfig(path: string): ConfigFinding[] {
  if (!existsSync(path)) {
    return [
      {
        severity: 'warning',
        file: 'openclaw',
        path,
        code: 'openclaw_config_missing',
        message: 'OpenClaw config file was not found.',
      },
    ];
  }
  try {
    return validateOpenClawConfig(JSON.parse(readFileSync(path, 'utf8')));
  } catch (err) {
    return [
      {
        severity: 'error',
        file: 'openclaw',
        path,
        code: 'openclaw_config_parse_error',
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

function readHermesConfig(path: string): ConfigFinding[] {
  if (!existsSync(path)) {
    return [
      {
        severity: 'warning',
        file: 'hermes',
        path,
        code: 'hermes_config_missing',
        message: 'Hermes config file was not found.',
      },
    ];
  }
  try {
    return validateHermesConfigText(readFileSync(path, 'utf8'));
  } catch (err) {
    return [
      {
        severity: 'error',
        file: 'hermes',
        path,
        code: 'hermes_config_read_error',
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

function formatFinding(finding: ConfigFinding): string {
  return `${finding.file}:${finding.path} ${finding.code}`;
}

export async function runAgentConfigHealth(options?: {
  readonly hermesConfigPath?: string;
  readonly openClawConfigPath?: string;
  readonly notify?: boolean;
}): Promise<AgentConfigHealthResult> {
  const hermesConfigPath = options?.hermesConfigPath ?? HERMES_PATHS.config;
  const openClawConfigPath =
    options?.openClawConfigPath ?? defaultOpenClawConfigPath();
  const findings = [
    ...readHermesConfig(hermesConfigPath),
    ...readOpenClawConfig(openClawConfigPath),
  ];

  const errors = findings.filter(finding => finding.severity === 'error');
  logJobEvent({
    job: JOB,
    event: 'checked',
    hermesConfigPath,
    openClawConfigPath,
    errors: errors.length,
    warnings: findings.length - errors.length,
    findings: findings.map(finding => ({
      severity: finding.severity,
      file: finding.file,
      path: finding.path,
      code: finding.code,
    })),
  });

  if (errors.length > 0 && options?.notify !== false) {
    const details = errors
      .slice(0, 8)
      .map(finding => `- ${formatFinding(finding)}`)
      .join('\n');
    await sendTelegram(
      `Hermes/OpenClaw agent config health failed (${errors.length} error${errors.length === 1 ? '' : 's'}).\n${details}\nRun: tsx scripts/hermes/jobs/agent-config-health.ts`
    );
  }

  return {
    findings,
    checked: { hermesConfigPath, openClawConfigPath },
  };
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const result = await runAgentConfigHealth();
    const errors = result.findings.filter(
      finding => finding.severity === 'error'
    );
    if (errors.length > 0) {
      for (const finding of errors) {
        console.error(`[${JOB}] ${formatFinding(finding)}`);
      }
      process.exitCode = 1;
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(err => {
    console.error(`[${JOB}] fatal:`, err);
    process.exit(1);
  });
}
