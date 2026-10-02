import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

import { type FetchImplementation, JovieInputError } from './client.js';
import { COMMANDS, type CommandSpec } from './commands.js';

// ponytail: hand-rolled stdio JSON-RPC (tools only). Adopt
// @modelcontextprotocol/sdk when we need resources, prompts, or HTTP transport.
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  readonly jsonrpc?: string;
  readonly id?: JsonRpcId;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
}

export interface McpContext {
  readonly version: string;
  readonly workerToken?: string;
  readonly baseUrl: string;
  readonly fetchImpl?: FetchImplementation;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toolDefinition(command: CommandSpec) {
  const properties: Record<string, unknown> = {};
  if (command.arg) {
    properties[command.arg.name] = {
      type: 'string',
      description: command.arg.description,
    };
  }
  if (command.acceptsFull) {
    properties.full = { type: 'boolean', description: 'Fetch the full guide' };
  }
  for (const flag of command.flags ?? []) {
    properties[flag.name] = { type: 'string', description: flag.description };
  }
  const required = [
    ...(command.arg ? [command.arg.name] : []),
    ...(command.flags ?? []).filter(flag => flag.required).map(f => f.name),
  ];
  return {
    name: command.tool,
    description: command.summary,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: command.readOnly,
      destructiveHint: false,
      idempotentHint:
        command.readOnly ||
        command.internal === true ||
        command.tool === 'create_profile',
      openWorldHint: true,
    },
  };
}

function errorText(error: unknown): string {
  const { code, apiCode, status, retryAfterSeconds, responseBody, retryable } =
    (error ?? {}) as Record<string, unknown>;
  return JSON.stringify({
    error: {
      code: code ?? 'CLI_ERROR',
      message: error instanceof Error ? error.message : String(error),
      ...(apiCode === undefined ? {} : { apiCode }),
      ...(retryable === undefined ? {} : { retryable }),
      ...(status === undefined ? {} : { status }),
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      ...(typeof responseBody === 'string' ? { responseBody } : {}),
    },
  });
}

async function callTool(
  params: Record<string, unknown> | undefined,
  context: McpContext
) {
  const command = COMMANDS.find(
    entry =>
      entry.tool === params?.name && (!entry.internal || context.workerToken)
  );
  if (!command) {
    return {
      content: [{ type: 'text', text: 'Unknown tool.' }],
      isError: true,
    };
  }
  const args = params?.arguments === undefined ? {} : params.arguments;
  try {
    if (!isObject(args))
      throw new JovieInputError('Tool arguments must be an object.');
    const allowed = new Set([
      ...(command.arg ? [command.arg.name] : []),
      ...(command.acceptsFull ? ['full'] : []),
      ...(command.flags ?? []).map(flag => flag.name),
    ]);
    if (Object.keys(args).some(key => !allowed.has(key)))
      throw new JovieInputError('Unknown tool argument.');
    for (const name of allowed) {
      const required =
        command.arg?.name === name ||
        command.flags?.some(flag => flag.name === name && flag.required);
      if (args[name] === undefined && !required) continue;
      if (
        name === 'full'
          ? typeof args[name] !== 'boolean'
          : typeof args[name] !== 'string' || !(args[name] as string).trim()
      )
        throw new JovieInputError(
          'Invalid tool argument type or missing required argument.'
        );
    }
    const result = await command.run(
      {
        arg: command.arg ? (args[command.arg.name] as string) : undefined,
        full: args.full === true,
        flags: Object.fromEntries(
          (command.flags ?? []).map(flag => [
            flag.name,
            typeof args[flag.name] === 'string'
              ? (args[flag.name] as string)
              : undefined,
          ])
        ),
        meta: { channel: 'mcp', version: context.version },
      },
      {
        baseUrl: context.baseUrl,
        workerToken: context.workerToken,
        fetchImpl: context.fetchImpl,
        userAgent: `jovie-cli/${context.version} mcp`,
      }
    );
    return typeof result === 'string'
      ? { content: [{ type: 'text', text: result }] }
      : {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          ...(result !== null &&
          typeof result === 'object' &&
          'status' in result &&
          ['failed', 'unavailable', 'requires_input'].includes(
            (result as { status: string }).status
          )
            ? { isError: true }
            : {}),
          ...(result !== null &&
          typeof result === 'object' &&
          !Array.isArray(result)
            ? { structuredContent: result }
            : {}),
        };
  } catch (error) {
    return {
      content: [{ type: 'text', text: errorText(error) }],
      isError: true,
    };
  }
}

/** Handle one JSON-RPC message; returns the response, or null for notifications. */
export async function handleMcpMessage(
  value: unknown,
  context: McpContext
): Promise<Record<string, unknown> | null> {
  if (
    !isObject(value) ||
    value.jsonrpc !== '2.0' ||
    typeof value.method !== 'string' ||
    (value.params !== undefined && !isObject(value.params)) ||
    (value.id !== undefined &&
      value.id !== null &&
      typeof value.id !== 'string' &&
      (typeof value.id !== 'number' || !Number.isFinite(value.id)))
  ) {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    };
  }
  const message = value as JsonRpcMessage;
  if (message.id === undefined) return null;
  const reply = (result: unknown) => ({
    jsonrpc: '2.0',
    id: message.id,
    result,
  });

  switch (message.method) {
    case 'initialize': {
      const requested = message.params?.protocolVersion;
      return reply({
        protocolVersion:
          typeof requested === 'string' &&
          SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'jovie', title: 'Jovie', version: context.version },
        instructions:
          'Create a Jovie artist profile from a Spotify artist URL with create_profile, then give the artist the claimUrl.',
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({
        tools: COMMANDS.filter(
          command => !command.internal || context.workerToken
        ).map(toolDefinition),
      });
    case 'tools/call':
      return reply(await callTool(message.params, context));
    default:
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      };
  }
}

/** Serve MCP over newline-delimited JSON-RPC until input closes. */
export async function serveMcp(
  input: Readable,
  output: { write(chunk: string): unknown },
  context: McpContext
): Promise<void> {
  // Process sequentially: bounded memory and no unhandled per-message rejection.
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      output.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`
      );
      continue;
    }
    try {
      const response = await handleMcpMessage(message, context);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    } catch {
      output.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: message && typeof message === 'object' ? (message.id ?? null) : null, error: { code: -32603, message: 'Internal error' } })}\n`
      );
    }
  }
}
