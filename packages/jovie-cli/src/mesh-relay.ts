import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { JovieInputError } from './client.js';
import { type MeshDependencies, meshCredentials } from './mesh.js';
import { flushOutbox, hubOrigin, outboxDir } from './mesh-hub.js';

type Flags = Readonly<Record<string, string | undefined>>;
type Frame = {
  type?: string;
  messages?: {
    id: string;
    from: string;
    to: string;
    kind: string;
    correlationId: string;
    acceptedAt: string;
    body: string;
  }[];
};

const PING_MS = 20_000;
const FLUSH_MS = 30_000;
const BACKOFF_MAX_MS = 60_000;

/** Minimal socket surface so tests can inject a fake. */
export type RelaySocket = {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: { data?: unknown }) => void
  ): void;
};
export type RelayDeps = MeshDependencies & {
  connect?: (url: string, headers: Record<string, string>) => RelaySocket;
};

function stateDir(kind: string, deps: MeshDependencies) {
  return dirname(outboxDir(kind, deps));
}

function appendDurable(file: string, line: string) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  appendFileSync(file, `${line}\n`, { mode: 0o600 });
  const fd = openSync(file, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

const defaultConnect = (
  url: string,
  headers: Record<string, string>
): RelaySocket => {
  // Node 22+ (undici) WebSocket accepts a non-standard init with headers, so the
  // bearer never goes in the URL.
  const Ctor = globalThis.WebSocket as unknown as new (
    url: string,
    init: unknown
  ) => RelaySocket;
  return new Ctor(url, { headers });
};

/**
 * `jovie mesh relay --as <kind>`: holds one WebSocket to the hub, appends each
 * message to ~/.jovie/mesh/<kind>/inbox.jsonl (fsync) and only then sends a
 * receipt. A receipt is stage 1 (delivered to this host); the agent still marks
 * a message handled by reading it (`mesh read`) or `mesh ack`. Probes are
 * answered by receipt so the hub can tell this relay is alive. Pings every 20 s,
 * flushes the local outbox every 30 s, reconnects forever with full jitter.
 */
export async function hubRelay(flags: Flags, deps: RelayDeps = {}) {
  const credentials = await meshCredentials(flags, deps);
  if (flags.install === 'true')
    return installRelay(credentials.senderKind, deps);
  const emit =
    deps.emit ?? ((line: string) => process.stdout.write(`${line}\n`));
  const connect = deps.connect ?? defaultConnect;
  const inbox = join(stateDir(credentials.senderKind, deps), 'inbox.jsonl');
  const url = `${hubOrigin(deps).replace(/^http/, 'ws')}/v1/stream`;
  const seen = new Set<string>();
  let backoff = 1_000;
  let spooled = 0;
  while (!deps.signal?.aborted) {
    const opened = await new Promise<boolean>(resolve => {
      let wasOpen = false;
      let socket: RelaySocket;
      try {
        socket = connect(url, { Authorization: `Bearer ${credentials.token}` });
      } catch {
        resolve(false);
        return;
      }
      const timers: ReturnType<typeof setInterval>[] = [];
      const stop = () => {
        for (const timer of timers) clearInterval(timer);
        resolve(wasOpen);
      };
      deps.signal?.addEventListener('abort', () => socket.close(), {
        once: true,
      });
      socket.addEventListener('open', () => {
        wasOpen = true;
        backoff = 1_000;
        emit(`relay connected kind=${credentials.senderKind}`);
        timers.push(
          setInterval(() => {
            try {
              socket.send('ping');
            } catch {
              /* reconnect handles it */
            }
          }, PING_MS)
        );
        timers.push(
          setInterval(() => {
            flushOutbox(credentials.senderKind, credentials.token, deps).catch(
              () => undefined
            );
          }, FLUSH_MS)
        );
        flushOutbox(credentials.senderKind, credentials.token, deps).catch(
          () => undefined
        );
      });
      socket.addEventListener('message', event => {
        if (event.data === 'pong') return;
        let frame: Frame;
        try {
          frame = JSON.parse(String(event.data)) as Frame;
        } catch {
          return;
        }
        if (frame.type !== 'messages' || !Array.isArray(frame.messages)) return;
        const ids: string[] = [];
        for (const message of frame.messages) {
          ids.push(message.id);
          if (message.kind === 'probe' || seen.has(message.id)) continue;
          appendDurable(
            inbox,
            JSON.stringify({ ...message, dataNotInstructions: true })
          );
          seen.add(message.id);
          if (seen.size > 5_000)
            seen.delete(seen.values().next().value as string);
          spooled++;
          emit(
            `mesh from=${message.from} to=${message.to} id=${message.correlationId} at=${message.acceptedAt} body=${JSON.stringify(message.body)}`
          );
        }
        if (ids.length) {
          try {
            socket.send(JSON.stringify({ type: 'receipt', ids }));
          } catch {
            // Unreceipted messages are re-sent on reconnect; the seen-set dedupes.
          }
        }
      });
      socket.addEventListener('close', stop);
      socket.addEventListener('error', () => {
        try {
          socket.close();
        } catch {
          /* closing */
        }
      });
    });
    if (deps.signal?.aborted) break;
    if (!opened) backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
    const sleep =
      deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    await sleep(Math.round(Math.random() * backoff), deps.signal);
  }
  return { ok: true, stopped: true, spooled };
}

/** launchd KeepAlive agent: restarts after crash, reboot or network change. */
export function installRelay(kind: string, deps: MeshDependencies = {}) {
  if (process.platform !== 'darwin')
    throw new JovieInputError(
      'mesh relay --install supports macOS launchd only; run `jovie mesh relay` under your init system.'
    );
  const label = `ie.jov.mesh-relay.${kind}`;
  const home = deps.env?.HOME || homedir();
  const plist = join(home, 'Library', 'LaunchAgents', `${label}.plist`);
  const log = join(stateDir(kind, deps), 'relay.log');
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(dirname(log), { recursive: true, mode: 0o700 });
  const args = [
    process.execPath,
    process.argv[1] ?? 'jovie',
    'mesh',
    'relay',
    '--as',
    kind,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${arg.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>`).join('')}</array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${log}</string>
<key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`;
  writeFileSync(plist, xml, { mode: 0o644 });
  const domain = `gui/${process.getuid?.() ?? 501}`;
  try {
    execFileSync('launchctl', ['bootout', `${domain}/${label}`], {
      stdio: 'ignore',
    });
  } catch {
    // not loaded yet
  }
  execFileSync('launchctl', ['bootstrap', domain, plist]);
  return { ok: true, installed: true, label, plist, log };
}
