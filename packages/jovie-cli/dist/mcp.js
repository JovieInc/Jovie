import { createInterface } from 'node:readline';
import { COMMANDS } from './commands.js';
// ponytail: hand-rolled stdio JSON-RPC (tools only). Adopt
// @modelcontextprotocol/sdk when we need resources, prompts, or HTTP transport.
const SUPPORTED_PROTOCOL_VERSIONS = [
    '2025-11-25',
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
];
function toolDefinition(command) {
    const properties = {};
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
            idempotentHint: true,
            openWorldHint: true,
        },
    };
}
function errorText(error) {
    const { code, apiCode, status, retryAfterSeconds, responseBody } = (error ??
        {});
    return JSON.stringify({
        error: {
            code: code ?? 'CLI_ERROR',
            message: error instanceof Error ? error.message : String(error),
            ...(apiCode === undefined ? {} : { apiCode }),
            ...(status === undefined ? {} : { status }),
            ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
            ...(typeof responseBody === 'string' ? { responseBody } : {}),
        },
    });
}
async function callTool(params, context) {
    const command = COMMANDS.find(entry => entry.tool === params?.name);
    if (!command) {
        return {
            content: [
                { type: 'text', text: `Unknown tool: ${String(params?.name)}` },
            ],
            isError: true,
        };
    }
    const args = (params?.arguments ?? {});
    try {
        const result = await command.run({
            arg: command.arg ? String(args[command.arg.name] ?? '') : undefined,
            full: args.full === true,
            flags: Object.fromEntries((command.flags ?? []).map(flag => [
                flag.name,
                typeof args[flag.name] === 'string'
                    ? args[flag.name]
                    : undefined,
            ])),
            meta: { channel: 'mcp', version: context.version },
        }, {
            baseUrl: context.baseUrl,
            fetchImpl: context.fetchImpl,
            userAgent: `jovie-cli/${context.version} mcp`,
        });
        return typeof result === 'string'
            ? { content: [{ type: 'text', text: result }] }
            : {
                content: [{ type: 'text', text: JSON.stringify(result) }],
                ...(result !== null &&
                    typeof result === 'object' &&
                    !Array.isArray(result)
                    ? { structuredContent: result }
                    : {}),
            };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: errorText(error) }],
            isError: true,
        };
    }
}
/** Handle one JSON-RPC message; returns the response, or null for notifications. */
export async function handleMcpMessage(message, context) {
    if (message.id === undefined)
        return null;
    const reply = (result) => ({
        jsonrpc: '2.0',
        id: message.id,
        result,
    });
    switch (message.method) {
        case 'initialize': {
            const requested = message.params?.protocolVersion;
            return reply({
                protocolVersion: typeof requested === 'string' &&
                    SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
                    ? requested
                    : SUPPORTED_PROTOCOL_VERSIONS[0],
                capabilities: { tools: {} },
                serverInfo: { name: 'jovie', title: 'Jovie', version: context.version },
                instructions: 'Create a Jovie artist profile from a Spotify artist URL with create_profile, then give the artist the claimUrl.',
            });
        }
        case 'ping':
            return reply({});
        case 'tools/list':
            return reply({ tools: COMMANDS.map(toolDefinition) });
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
export async function serveMcp(input, output, context) {
    const pending = [];
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
        if (!line.trim())
            continue;
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
            continue;
        }
        pending.push(handleMcpMessage(message, context).then(response => {
            if (response)
                output.write(`${JSON.stringify(response)}\n`);
        }));
    }
    await Promise.all(pending);
}
//# sourceMappingURL=mcp.js.map