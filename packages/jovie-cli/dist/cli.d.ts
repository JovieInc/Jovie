#!/usr/bin/env node
import { type FetchImplementation } from './client.js';
export declare const CLI_VERSION_FALLBACK = "0.0.0-private";
export declare function packageVersionFromText(manifestText: string): string;
export declare function resolveCliVersion(manifestPath?: string): string;
export interface CliOutput {
    write(chunk: string): unknown;
}
export interface CliDependencies {
    readonly fetchImpl?: FetchImplementation;
    readonly stdout?: CliOutput;
    readonly stderr?: CliOutput;
    readonly stdin?: NodeJS.ReadableStream;
    readonly homeDir?: string;
}
export declare function runCli(argv: readonly string[], dependencies?: CliDependencies): Promise<number>;
//# sourceMappingURL=cli.d.ts.map