import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * Dependency-free validator for the pinned bake-off script. `scripts/` is not a
 * pnpm workspace package, so third-party imports such as `zod` do not resolve
 * from here; the checks below mirror the original zod schema rule-for-rule.
 */

export interface BakeOffTurnExpect {
  acknowledgesArtist?: boolean;
  asksClarifyingOrOffersHelp?: boolean;
  maxResponseSentences?: number;
  mentionsReleasePlanning?: boolean;
  shouldInvokeTool?: string;
  toolCallRequired?: string;
  mentionsDaysUntilDrop?: number;
  mentionsTitle?: string;
  handlesTopicShift?: boolean;
  providesConcretePostIdea?: boolean;
  doesNotHallucinateMetrics?: boolean;
  gracefulClose?: boolean;
  hangupOrEndCall?: boolean;
  [key: string]: unknown;
}

export interface BakeOffTestScript {
  version: string;
  issue: string;
  persona: { name: string; role: string; voice: string; context: string };
  agentSystemPrompt: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    mockResponse?: Record<string, unknown>;
  }>;
  turns: Array<{
    turn: number;
    speaker: 'caller';
    utterance: string;
    interruption?: boolean;
    expect: BakeOffTurnExpect;
  }>;
  latencyMetrics: string[];
  humanJudgmentAxes: string[];
}

type Guard = (value: unknown, path: string) => void;

function fail(path: string, message: string): never {
  throw new Error(`Invalid bake-off test script at ${path}: ${message}`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const record: Guard = (value, path) => {
  if (!isPlainRecord(value)) fail(path, 'expected object');
};

function string(minLength = 0): Guard {
  return (value, path) => {
    if (typeof value !== 'string') fail(path, 'expected string');
    if (value.length < minLength) {
      fail(path, `expected at least ${minLength} characters`);
    }
  };
}

const boolean: Guard = (value, path) => {
  if (typeof value !== 'boolean') fail(path, 'expected boolean');
};

function integer(options: { positive?: boolean } = {}): Guard {
  return (value, path) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      fail(path, 'expected integer');
    }
    if (options.positive && value <= 0) fail(path, 'expected positive');
  };
}

function optional(guard: Guard): Guard {
  return (value, path) => {
    if (value !== undefined) guard(value, path);
  };
}

function object(shape: Record<string, Guard>): Guard {
  return (value, path) => {
    record(value, path);
    const target = value as Record<string, unknown>;
    for (const [key, guard] of Object.entries(shape)) {
      guard(target[key], `${path}.${key}`);
    }
  };
}

function array(
  item: Guard,
  length: { min?: number; exact?: number } = {}
): Guard {
  return (value, path) => {
    if (!Array.isArray(value)) fail(path, 'expected array');
    if (length.exact !== undefined && value.length !== length.exact) {
      fail(path, `expected exactly ${length.exact} items`);
    }
    if (length.min !== undefined && value.length < length.min) {
      fail(path, `expected at least ${length.min} items`);
    }
    value.forEach((entry, index) => {
      item(entry, `${path}[${index}]`);
    });
  };
}

const turnExpect = object({
  acknowledgesArtist: optional(boolean),
  asksClarifyingOrOffersHelp: optional(boolean),
  maxResponseSentences: optional(integer({ positive: true })),
  mentionsReleasePlanning: optional(boolean),
  shouldInvokeTool: optional(string()),
  toolCallRequired: optional(string()),
  mentionsDaysUntilDrop: optional(integer()),
  mentionsTitle: optional(string()),
  handlesTopicShift: optional(boolean),
  providesConcretePostIdea: optional(boolean),
  doesNotHallucinateMetrics: optional(boolean),
  gracefulClose: optional(boolean),
  hangupOrEndCall: optional(boolean),
});

const bakeOffTestScript = object({
  version: string(1),
  issue: string(1),
  persona: object({
    name: string(1),
    role: string(1),
    voice: string(1),
    context: string(1),
  }),
  agentSystemPrompt: string(20),
  tools: array(
    object({
      name: string(1),
      description: string(1),
      parameters: record,
      mockResponse: optional(record),
    }),
    { min: 1 }
  ),
  turns: array(
    object({
      turn: integer({ positive: true }),
      speaker: (value, path) => {
        if (value !== 'caller') fail(path, 'expected "caller"');
      },
      utterance: string(1),
      interruption: optional(boolean),
      expect: turnExpect,
    }),
    { exact: 5 }
  ),
  latencyMetrics: array(string(1), { min: 1 }),
  humanJudgmentAxes: array(string(1), { min: 1 }),
});

export function parseBakeOffTestScript(value: unknown): BakeOffTestScript {
  bakeOffTestScript(value, 'script');
  return value as BakeOffTestScript;
}

export function defaultTestScriptPath(): string {
  return resolve(import.meta.dirname, 'test-script.json');
}

export function loadBakeOffTestScript(
  path = defaultTestScriptPath()
): BakeOffTestScript {
  const raw = readFileSync(path, 'utf8');
  return parseBakeOffTestScript(JSON.parse(raw));
}

export function assertPinnedFiveTurnFlow(script: BakeOffTestScript): void {
  const turnNumbers = script.turns.map(t => t.turn);
  if (turnNumbers.join(',') !== '1,2,3,4,5') {
    throw new Error(
      `Expected turns 1–5 in order; got ${turnNumbers.join(',')}`
    );
  }
}
