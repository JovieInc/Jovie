#!/usr/bin/env -S node --import tsx
import process from 'node:process';
import { Inbox } from './inbox';
import { type IngestOptions, ingest } from './ingest';
import { Ledger } from './ledger';
import { photosOriginalsSource } from './scanner';
import type { IngestSource } from './types';
import { watchSources } from './watch';

interface Arguments {
  readonly positional: string[];
  readonly flags: Record<string, string[]>;
}

function parseArguments(argv: readonly string[]): Arguments {
  const positional: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }
    const name = argument.slice(2);
    const values = flags[name] ?? [];
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) values.push(next), index++;
    else values.push('true');
    flags[name] = values;
  }
  return { positional, flags };
}

function first(args: Arguments, name: string): string | undefined {
  return args.flags[name]?.[0];
}

function requireFlag(args: Arguments, name: string): string {
  const value = first(args, name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

async function sourcesFrom(args: Arguments): Promise<IngestSource[]> {
  const sources: IngestSource[] = [
    ...(args.flags['owner-source'] ?? []).map(root => ({
      root,
      origin: 'yours' as const,
    })),
    ...(args.flags['fan-source'] ?? []).map(root => ({
      root,
      origin: 'fan' as const,
    })),
    ...(args.flags.source ?? []).map(root => ({
      root,
      origin: 'unknown' as const,
    })),
  ];
  const photosLibrary = first(args, 'photos-library');
  const photosRequested = first(args, 'photos') === 'true' || photosLibrary;
  const ownerPhotosRequested = first(args, 'owner-photos') === 'true';
  if (photosRequested || ownerPhotosRequested) {
    sources.push(
      await photosOriginalsSource(
        photosLibrary,
        ownerPhotosRequested ? 'yours' : 'unknown'
      )
    );
  }
  if (sources.length === 0) {
    throw new Error(
      'Use --photos, --owner-photos, --owner-source, --fan-source, or --source at least once'
    );
  }
  return sources;
}

async function ingestOptions(args: Arguments): Promise<IngestOptions> {
  return {
    sources: await sourcesFrom(args),
    libraryDir: requireFlag(args, 'library'),
    stateDir: requireFlag(args, 'state'),
  };
}

async function runInbox(args: Arguments, action?: string): Promise<void> {
  const stateDir = requireFlag(args, 'state');
  const ledger = await Ledger.open(stateDir);
  const inbox = await Inbox.open(stateDir, ledger);
  const id = first(args, 'id');
  if (action === 'list') {
    console.log(JSON.stringify(inbox.pending(), null, 2));
    return;
  }
  if ((action === 'keep' || action === 'skip') && id) {
    const item =
      action === 'keep' ? await inbox.swipeKeep(id) : await inbox.swipeSkip(id);
    console.log(JSON.stringify(item, null, 2));
    return;
  }
  if (action === 'close') {
    const rejects = (args.flags.reject ?? []).map(value => {
      const separator = value.indexOf('=');
      if (separator < 1)
        throw new Error('--reject must be <inbox-id>=<comment>');
      return {
        itemId: value.slice(0, separator),
        comment: value.slice(separator + 1),
      };
    });
    await inbox.closeSession(rejects);
    return;
  }
  throw new Error(
    'Use inbox list, keep --id, skip --id, or close --reject <id>=<comment>'
  );
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const [command, action] = args.positional;
  if (command === 'ingest') {
    console.log(
      JSON.stringify(await ingest(await ingestOptions(args)), null, 2)
    );
    return;
  }
  if (command === 'watch') {
    const options = await ingestOptions(args);
    watchSources(options, {
      onReport: report => console.log(JSON.stringify(report, null, 2)),
      onError: error =>
        console.error(error instanceof Error ? error.message : String(error)),
    });
    console.log(
      `Watching ${options.sources.map(source => source.root).join(', ')}`
    );
    return;
  }
  if (command === 'inbox') return runInbox(args, action);
  console.log(
    'Usage: media-ingest <ingest|watch|inbox> --library <dir> --state <dir> [--photos|--owner-photos|--owner-source <dir>|--fan-source <dir>|--source <dir>]'
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
