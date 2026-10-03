import type { Readable } from 'node:stream';
import type { FetchImplementation } from './client.js';
type JsonRpcId = string | number | null;
interface JsonRpcMessage {
    readonly jsonrpc?: string;
    readonly id?: JsonRpcId;
    readonly method?: string;
    readonly params?: Record<string, unknown>;
}
export interface McpContext {
    readonly version: string;
    readonly baseUrl: string;
    readonly fetchImpl?: FetchImplementation;
}
/** Handle one JSON-RPC message; returns the response, or null for notifications. */
export declare function handleMcpMessage(message: JsonRpcMessage, context: McpContext): Promise<Record<string, unknown> | null>;
/** Serve MCP over newline-delimited JSON-RPC until input closes. */
export declare function serveMcp(input: Readable, output: {
    write(chunk: string): unknown;
}, context: McpContext): Promise<void>;
export {};
//# sourceMappingURL=mcp.d.ts.map