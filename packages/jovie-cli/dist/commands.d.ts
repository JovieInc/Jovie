import { type ResourceOptions } from './client.js';
export interface CommandInput {
    readonly arg?: string;
    readonly full?: boolean;
    readonly flags?: Readonly<Record<string, string | undefined>>;
    /** Set by the caller (CLI or MCP); attached to reports as safe context. */
    readonly meta?: {
        readonly channel: 'cli' | 'mcp';
        readonly version: string;
    };
}
export interface FlagSpec {
    readonly name: string;
    readonly description: string;
    readonly required?: boolean;
}
/** One definition drives CLI dispatch, `--help`, and MCP tools. */
export interface CommandSpec {
    readonly path: readonly [string, string];
    readonly tool: string;
    readonly summary: string;
    readonly arg?: {
        readonly name: string;
        readonly description: string;
    };
    readonly acceptsFull?: boolean;
    readonly flags?: readonly FlagSpec[];
    readonly readOnly: boolean;
    readonly run: (input: CommandInput, options: ResourceOptions) => Promise<unknown>;
}
export declare const COMMANDS: readonly CommandSpec[];
export declare function findCommand(positionals: readonly string[]): CommandSpec | undefined;
//# sourceMappingURL=commands.d.ts.map