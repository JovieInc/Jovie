#!/usr/bin/env -S npx tsx
import { Inbox } from './inbox';
import { ingest } from './ingest';
import { Ledger } from './ledger';
import { WhisperCliTranscriber } from './transcribe';
import { watchSource } from './watch';

interface Args {
  _: string[];
  flags: Record<string, string[]>;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const list = args.flags[key] ?? [];
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        list.push(argv[++i]);
      } else {
        list.push('true');
      }
      args.flags[key] = list;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function flag(args: Args, key: string): string | undefined {
  return args.flags[key]?.[0];
}

function multi(args: Args, key: string): string[] {
  return args.flags[key] ?? [];
}

function sharedOptions(args: Args) {
  const libraryDir = flag(args, 'library');
  const stateDir = flag(args, 'state');
  if (!libraryDir || !stateDir) {
    throw new Error('--library and --state are required');
  }
  return {
    libraryDir,
    stateDir,
    fanDirs: multi(args, 'fan-dir'),
    ownerDevices: multi(args, 'owner-device'),
    catalogPath: flag(args, 'catalog'),
    primaryLanguage: flag(args, 'language') ?? 'en',
    transcriber:
      flag(args, 'whisper') === 'true' ? new WhisperCliTranscriber() : null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [command, sub] = args._;

  if (command === 'ingest') {
    const sources = multi(args, 'source');
    if (sources.length === 0)
      throw new Error('at least one --source is required');
    const report = await ingest({ ...sharedOptions(args), sources });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'watch') {
    const source = flag(args, 'source');
    if (!source) throw new Error('--source is required');
    watchSource(source, sharedOptions(args), report => {
      console.log(JSON.stringify(report, null, 2));
    });
    console.log(`watching ${source}`);
    return;
  }

  if (command === 'inbox') {
    const stateDir = flag(args, 'state');
    if (!stateDir) throw new Error('--state is required');
    const ledger = await Ledger.open(stateDir);
    const inbox = await Inbox.open(stateDir, ledger);
    if (sub === 'list') {
      console.log(JSON.stringify(inbox.pending(), null, 2));
      return;
    }
    if (sub === 'keep' || sub === 'skip') {
      const id = flag(args, 'id');
      if (!id) throw new Error('--id is required');
      const item = inbox.get(id);
      if (!item) throw new Error(`unknown inbox item: ${id}`);
      const asset = ledger.assets().find(a => a.id === item.assetId);
      if (!asset) throw new Error(`asset missing for ${id}`);
      const updated =
        sub === 'keep'
          ? await inbox.swipeKeep(id, asset)
          : await inbox.swipeSkip(id, asset);
      console.log(JSON.stringify(updated, null, 2));
      return;
    }
    if (sub === 'close') {
      await inbox.closeSession(multi(args, 'comment'));
      console.log('session closed');
      return;
    }
    throw new Error(
      'usage: inbox list|keep --id <id>|skip --id <id>|close --comment <text>'
    );
  }

  console.log(
    'usage: media-ingest <ingest|watch|inbox> --library <dir> --state <dir> [options]'
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
