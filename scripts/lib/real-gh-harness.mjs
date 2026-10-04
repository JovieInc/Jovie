import { execFileSync, spawn } from 'node:child_process';
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';

/**
 * Contract-faithful harness for workflow shell that calls the GitHub CLI
 * (JOV-7698). It runs the real `gh` binary, so argument grammar and `--jq`
 * evaluation are the CLI's own. Only the network is replaced: gh treats
 * `github.localhost` as a plain-HTTP host, and HTTP_PROXY routes that host to
 * a loopback server serving the caller's fixture routes. Nothing leaves the
 * machine and no token is real.
 */

export const GH_FAKE_HOST = 'github.localhost';

/** True when the file starts with a binary executable magic (ELF, Mach-O, MZ). */
function isBinaryExecutable(path) {
  try {
    const fd = openSync(path, 'r');
    const head = Buffer.alloc(4);
    const count = readSync(fd, head, 0, 4, 0);
    closeSync(fd);
    if (count < 2) return false;
    if (head.readUInt32BE(0) === 0x7f454c46) return true; // ELF
    if (
      head.readUInt32BE(0) === 0xfeedface ||
      head.readUInt32BE(0) === 0xfeedfacf ||
      head.readUInt32BE(0) === 0xcefaedfe ||
      head.readUInt32BE(0) === 0xcffaedfe ||
      head.readUInt32BE(0) === 0xcafebabe ||
      head.readUInt32BE(0) === 0xbebafeca
    )
      return true; // Mach-O / fat Mach-O
    return head[0] === 0x4d && head[1] === 0x5a; // MZ (Windows PE)
  } catch {
    return false;
  }
}

/**
 * Absolute path of the real gh binary, or null when it is not installed.
 * PATH may lead with shell shims that wrap gh (e.g. the jovie-lanes token
 * shim); those are scripts, so the first actual binary executable wins and
 * `command -v` is only a fallback.
 */
export function resolveRealGh() {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (!dir) continue;
    const candidate = `${dir}/gh`;
    try {
      accessSync(candidate, constants.X_OK);
    } catch {
      continue;
    }
    if (isBinaryExecutable(candidate)) return candidate;
  }
  try {
    return (
      execFileSync('sh', ['-c', 'command -v gh'], {
        encoding: 'utf8',
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/** First line of `gh --version`, recorded as the exercised boundary version. */
export function realGhVersion(gh = resolveRealGh()) {
  if (!gh) return null;
  return execFileSync(gh, ['--version'], { encoding: 'utf8' }).split('\n')[0];
}

/** Minimal stored (uncompressed) zip, so real `unzip` can read fixtures. */
export function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(text);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/**
 * Run a bash script with the real gh against fixture routes.
 * `route(pathWithQuery)` returns `{ status?, body }` (string, Buffer or JSON
 * value) or null for a 404. Resolves with exit code, output and the API paths
 * gh actually requested.
 */
export async function runWithRealGh({ script, env = {}, route, gh }) {
  const binary = gh ?? resolveRealGh();
  if (!binary) throw new Error('real gh binary is not installed');
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://api.${GH_FAKE_HOST}`);
    const path = `${url.pathname.replace(/^\//, '')}${url.search}`;
    requests.push(`${req.method} ${path}`);
    const hit = route(path);
    if (!hit) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"message":"Not Found"}');
      return;
    }
    const raw =
      typeof hit.body === 'string' || Buffer.isBuffer(hit.body)
        ? hit.body
        : JSON.stringify(hit.body);
    res.writeHead(hit.status ?? 200, {
      'content-type': Buffer.isBuffer(raw)
        ? 'application/zip'
        : 'application/json',
    });
    res.end(raw);
  });
  await new Promise(done => server.listen(0, '127.0.0.1', () => done(null)));
  const address = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  const proxy = `http://127.0.0.1:${address.port}`;
  const home = mkdtempSync(join(tmpdir(), 'real-gh-harness-'));
  mkdirSync(join(home, 'config'));
  // Script PATH may lead with shims that wrap gh (e.g. the jovie-lanes token
  // shim). A dedicated bin dir pinned to the resolved real binary keeps the
  // exercised grammar the real CLI's.
  const bin = join(home, 'bin');
  mkdirSync(bin);
  const harnessGh = join(bin, 'gh');
  try {
    symlinkSync(binary, harnessGh);
  } catch {
    copyFileSync(binary, harnessGh);
    chmodSync(harnessGh, 0o755);
  }
  try {
    return await new Promise((done, fail) => {
      const child = spawn('bash', ['-c', script], {
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          HOME: home,
          GH_CONFIG_DIR: join(home, 'config'),
          GH_HOST: GH_FAKE_HOST,
          GH_TOKEN: 'harness-token',
          GH_ENTERPRISE_TOKEN: 'harness-token',
          GH_NO_UPDATE_NOTIFIER: '1',
          GH_PROMPT_DISABLED: '1',
          HTTP_PROXY: proxy,
          http_proxy: proxy,
          ...env,
        },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => {
        stdout += chunk;
      });
      child.stderr.on('data', chunk => {
        stderr += chunk;
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
      child.on('error', fail);
      child.on('close', code => {
        clearTimeout(timer);
        done({ code, stdout, stderr, requests });
      });
    });
  } finally {
    server.close();
    rmSync(home, { recursive: true, force: true });
  }
}
