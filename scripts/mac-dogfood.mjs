// Mac dogfood runner: drives the INSTALLED Jovie bundles with cua-driver (background
// delivery, no focus steal) and records receipts. Read-only: presses only SAFE_PRESS
// labels, never sends, adds, approves, downloads or restarts. Never builds or clones.
//
// Usage (on the Mac that has the apps installed and cua-driver granted):
//   node scripts/mac-dogfood.mjs --channel staging|production|both --out DIR
//        [--vision] [--metrics-only]
// Filing to Linear is a separate step that needs LINEAR_API_KEY (run it on gem):
//   node scripts/mac-dogfood.mjs --file-from DIR
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildMacReceipt,
  classifySession,
  evalBuildIdentity,
  evalComposer,
  evalInboxLabel,
  evalLaunchReadiness,
  evalOvieNoFalseGreen,
  evalShellClean,
  evalShellNav,
  evalSignInOptions,
  evalSignInSurface,
  evalUpdatePrompt,
  evalWindowReady,
  MAC_CHANNELS,
  MAC_MISSIONS,
  macCertification,
  macStatusDoc,
  navMatches,
  normalizeSnapshot,
  ovieSettled,
  parseHidIdleSeconds,
  SAFE_PRESS,
  SHELL_NAV,
  shouldRun,
} from './lib/mac-dogfood.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Thin cua-driver CLI client; `exec` is injectable so the loop is testable. */
export function createCua({
  exec = (bin, args) =>
    execFileSync(bin, args, {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    }),
} = {}) {
  const call = (tool, args = {}) =>
    JSON.parse(exec('cua-driver', [tool, JSON.stringify(args)]));
  return {
    call,
    launch: bundleId => call('launch_app', { bundle_id: bundleId }),
    windows: pid => call('list_windows', { pid }).windows ?? [],
    state: (pid, windowId) =>
      call('get_window_state', { pid, window_id: windowId }),
    /** Press by exact label, only if the label is allow-listed. Returns false when absent. */
    press(pid, snap, label, role) {
      if (!SAFE_PRESS.has(label))
        throw new Error(`refusing to press "${label}": not read-only safe`);
      const el = snap.elements.find(
        e => e.label === label && (!role || e.role === role)
      );
      if (!el?.token) return false;
      call('click', { pid, element_token: el.token });
      return true;
    },
  };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function readBuildIdentity(channel) {
  return readJson(
    path.join(
      MAC_CHANNELS[channel].appPath,
      'Contents/Resources/build-identity.json'
    )
  );
}

export function readLaunchReadiness(channel) {
  return readJson(
    path.join(
      os.homedir(),
      'Library/Application Support',
      MAC_CHANNELS[channel].supportDir,
      'desktop-launch-readiness.json'
    )
  );
}

async function fetchWeb(origin, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${origin}/api/health/build-info`, {
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Latest published build for a lane from the release feed the updater itself uses. */
async function latestPublished(channel, fetchImpl = fetch) {
  try {
    const url =
      channel === 'staging'
        ? 'https://api.github.com/repos/JovieInc/Jovie/releases/tags/desktop-staging'
        : 'https://api.github.com/repos/JovieInc/Jovie/releases/latest';
    const res = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.name || j.tag_name || '').replace(/^v/, '') || null;
  } catch {
    return null;
  }
}

async function waitForMainWindow(cua, pid, { timeoutMs = 45_000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const wins = cua.windows(pid).filter(w => (w.bounds?.height ?? 0) > 40);
    const onScreen = wins.find(w => w.is_on_screen) ?? wins[0];
    if (onScreen)
      return { windows: wins, window: onScreen, waitedMs: Date.now() - t0 };
    await sleep(1000);
  }
  return { windows: [], window: null, waitedMs: Date.now() - t0 };
}

function snapshot(cua, pid, windowId, outDir, name, { keepShot }) {
  const state = cua.state(pid, windowId);
  const snap = normalizeSnapshot(state);
  if (state.screenshot_png_b64 && keepShot) {
    mkdirSync(keepShot, { recursive: true });
    const file = path.join(keepShot, `${name}.png`);
    writeFileSync(file, Buffer.from(state.screenshot_png_b64, 'base64'));
    snap.screenshot = file;
  }
  return snap;
}

const UPDATE_MODAL = /^(Downloading )?Jovie \S+( Is (Available|Ready))?$/;

/**
 * Snapshot, and if the update modal is up (it returns after a workspace switch),
 * press Later first so it cannot swallow the next journey step.
 */
async function cleared(cua, pid, wid, outDir, name, opts) {
  let snap = snapshot(cua, pid, wid, outDir, name, opts);
  for (let i = 0; i < 2; i++) {
    const modal = snap.elements.some(
      e => e.role === 'AXHeading' && UPDATE_MODAL.test(e.label)
    );
    if (!modal || !cua.press(pid, snap, 'Later', 'AXButton')) break;
    await sleep(1000);
    snap = snapshot(cua, pid, wid, outDir, name, opts);
  }
  return snap;
}

/** Which workspace the sidebar is in: the artist app lists Identity, Ovie does not. */
export function workspaceOf(snap) {
  return snap.elements.some(e => e.role === 'AXLink' && e.label === 'Identity')
    ? 'Jovie'
    : 'OV';
}

async function switchWorkspace(cua, pid, wid, outDir, target, sleepMs) {
  const sw = await cleared(cua, pid, wid, outDir, 'pre-ws', { keepShot: null });
  if (!cua.press(pid, sw, 'Switch Workspace', 'AXPopUpButton')) return false;
  await sleep(1200);
  const menu = snapshot(cua, pid, wid, outDir, 'ws-menu', { keepShot: null });
  if (!cua.press(pid, menu, target, 'AXMenuItem')) return false;
  await sleep(sleepMs + 2000);
  return true;
}

/** Poll until `until(snap)` holds (or the timeout), then capture the final snapshot. */
async function settleSnapshot(
  cua,
  pid,
  wid,
  outDir,
  name,
  { keepShot, until, timeoutMs = 20_000, stepMs = 1000 }
) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const probe = normalizeSnapshot(cua.state(pid, wid));
    if (until(probe)) break;
    await sleep(stepMs);
  }
  return snapshot(cua, pid, wid, outDir, name, { keepShot });
}

/**
 * Run every implemented journey for one channel. The session already on the Mac
 * decides which journeys apply: `sessionKind` is `founder` (Tim's own session:
 * read-only, no screenshots leave the host) or `signed-out`.
 */
export async function runChannel({
  channel,
  cua,
  outDir,
  fetchImpl = fetch,
  sleepMs = 2500,
  now = () => new Date(),
  readers = { identity: readBuildIdentity, readiness: readLaunchReadiness },
}) {
  const cfg = MAC_CHANNELS[channel];
  const startedAt = now().toISOString();
  const identity = readers.identity(channel);
  const web = await fetchWeb(cfg.webOrigin, fetchImpl);
  const latestPublishedVersion = await latestPublished(channel, fetchImpl);
  const checks = new Map(MAC_MISSIONS.map(m => [m.id, []]));
  const add = (id, c) => checks.get(id).push(...[].concat(c));
  const privateDir = path.join(outDir, 'private', channel);
  const shareDir = path.join(outDir, 'evidence', channel);

  add('dogfood:mac-launch', evalBuildIdentity({ identity, channel }));
  const launched = cua.launch(cfg.bundleId);
  const pid = launched.pid;
  const ready = await waitForMainWindow(cua, pid);
  add(
    'dogfood:mac-launch',
    evalWindowReady({
      windows: ready.windows,
      channel,
      waitedMs: ready.waitedMs,
    })
  );
  let sessionKind = 'unknown';
  if (ready.window) {
    await sleep(sleepMs);
    const wid = ready.window.window_id;
    let snap = snapshot(cua, pid, wid, outDir, 'first', {
      keepShot: privateDir,
    });
    sessionKind = classifySession(snap);
    add(
      'dogfood:mac-update',
      evalUpdatePrompt(snap, channel, identity?.version)
    );
    if (cua.press(pid, snap, 'Later', 'AXButton')) {
      await sleep(sleepMs);
      snap = snapshot(cua, pid, wid, outDir, 'after-later', {
        keepShot: privateDir,
      });
    }
    if (sessionKind === 'signed-out') {
      const shot = sessionKind === 'signed-out' ? shareDir : privateDir;
      snap = snapshot(cua, pid, wid, outDir, 'signin', { keepShot: shot });
      add('dogfood:mac-signin', evalSignInSurface(snap, channel));
      if (cua.press(pid, snap, 'Other Sign-in Options', 'AXButton')) {
        await sleep(sleepMs);
        const opts = snapshot(cua, pid, wid, outDir, 'signin-options', {
          keepShot: shareDir,
        });
        add('dogfood:mac-signin', evalSignInOptions(opts, channel));
      }
    } else if (sessionKind === 'signed-in') {
      const startWorkspace = workspaceOf(snap);
      if (startWorkspace !== 'Jovie')
        await switchWorkspace(cua, pid, wid, outDir, 'Jovie', sleepMs);
      const visits = {};
      for (const n of SHELL_NAV) {
        const cur = await cleared(cua, pid, wid, outDir, 'pre', {
          keepShot: null,
        });
        if (!cua.press(pid, cur, n.label, 'AXLink')) continue;
        visits[n.label] = await settleSnapshot(
          cua,
          pid,
          wid,
          outDir,
          `nav-${n.label}`,
          {
            keepShot: privateDir,
            until: x => navMatches(n.label, x),
          }
        );
      }
      add('dogfood:mac-shell', evalShellNav(visits, channel));
      add('dogfood:mac-shell', evalShellClean(visits, channel));
      const bell = visits.Inbox ?? snap;
      add('dogfood:mac-shell', evalInboxLabel(bell, channel));
      // Chat composer: open a new chat (no send) and assert the input.
      const cur = await cleared(cua, pid, wid, outDir, 'pre-chat', {
        keepShot: null,
      });
      if (cua.press(pid, cur, 'New Chat', 'AXLink'))
        await sleep(sleepMs + 1000);
      const chat = snapshot(cua, pid, wid, outDir, 'chat', {
        keepShot: privateDir,
      });
      add('dogfood:mac-chat', evalComposer(chat, channel));
      // Ovie Home (admin workspace) when the workspace switcher offers OV; then return.
      if (await switchWorkspace(cua, pid, wid, outDir, 'OV', sleepMs + 1000)) {
        const ov = await settleSnapshot(cua, pid, wid, outDir, 'ovie-home', {
          keepShot: privateDir,
          until: ovieSettled,
          timeoutMs: 30_000,
        });
        if (workspaceOf(ov) === 'OV')
          add('dogfood:mac-ovie-shipping', evalOvieNoFalseGreen(ov, channel));
        if (startWorkspace === 'Jovie')
          await switchWorkspace(cua, pid, wid, outDir, 'Jovie', sleepMs);
      }
      if (
        startWorkspace === 'OV' &&
        workspaceOf(
          snapshot(cua, pid, wid, outDir, 'end', { keepShot: null })
        ) !== 'OV'
      )
        await switchWorkspace(cua, pid, wid, outDir, 'OV', sleepMs);
    }
  }
  const completedAt = now().toISOString();
  add(
    'dogfood:mac-launch',
    evalLaunchReadiness({ readiness: readers.readiness(channel), channel })
  );

  const receipts = [];
  for (const mission of MAC_MISSIONS) {
    const list = checks.get(mission.id);
    const applies =
      mission.needs === 'any' ||
      (mission.needs === 'signed-out' && sessionKind === 'signed-out') ||
      ((mission.needs === 'signed-in' || mission.needs === 'admin') &&
        sessionKind === 'signed-in');
    if (mission.automation === 'implemented' && applies && list.length === 0)
      list.push({
        id: mission.checks[0] ?? 'journey',
        target: `desktop:${channel}`,
        status: 'unverified',
        summary: 'journey was not reached (a required control was missing)',
      });
    if (mission.automation === 'implemented' && !applies) {
      list.length = 0;
      list.push({
        id: mission.checks[0] ?? 'session',
        target: `desktop:${channel}`,
        status: 'unverified',
        summary: `needs a ${mission.needs} session; this host has ${sessionKind}`,
      });
    }
    receipts.push({
      mission,
      checks: list,
      receipt: buildMacReceipt({
        mission,
        checks: list,
        channel,
        identity,
        web,
        sessionKind,
        startedAt,
        completedAt,
        evidenceRefs: [`checks:${mission.id}`, `session:${sessionKind}`],
      }),
    });
  }
  return {
    channel,
    identity,
    web,
    latestPublishedVersion,
    sessionKind,
    receipts,
    startedAt,
    completedAt,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = {
    channel: 'both',
    out: path.join(os.tmpdir(), `mac-dogfood-${Date.now()}`),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--channel') args.channel = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  const statePath =
    args.state ??
    path.join(os.homedir(), '.local/state/jovie-mac-dogfood/last.json');
  if (args.tick) {
    const channelsNow =
      args.channel === 'both' ? ['staging', 'production'] : [args.channel];
    const installed = {};
    const latest = {};
    for (const ch of channelsNow) {
      const id = readBuildIdentity(ch);
      installed[ch] = {
        version: id?.version ?? null,
        sourceRevision: id?.sourceRevision ?? null,
      };
      latest[ch] = await latestPublished(ch);
    }
    let idleSeconds = null;
    try {
      idleSeconds = parseHidIdleSeconds(
        execFileSync('ioreg', ['-c', 'IOHIDSystem'], {
          encoding: 'utf8',
          timeout: 10_000,
        })
      );
    } catch {}
    const decision = shouldRun({
      state: readJson(statePath),
      installed,
      latest,
      maxAgeMinutes: args.maxAge ?? 720,
      idleSeconds,
      requireIdleSeconds: (args.idleMin ?? 10) * 60,
    });
    console.log(JSON.stringify({ tick: decision }));
    if (!decision.run) return;
  }
  mkdirSync(args.out, { recursive: true });
  const cua = createCua();
  const channels =
    args.channel === 'both' ? ['staging', 'production'] : [args.channel];
  const results = {};
  const findings = [];
  const allChecks = [];
  for (const ch of channels) {
    if (!existsSync(MAC_CHANNELS[ch].appPath)) {
      console.error(`skip ${ch}: ${MAC_CHANNELS[ch].appPath} is not installed`);
      continue;
    }
    results[ch] = await runChannel({ channel: ch, cua, outDir: args.out });
    for (const r of results[ch].receipts)
      for (const c of r.checks) {
        allChecks.push({ channel: ch, mission: r.mission.id, check: c });
        if (c.status === 'failed')
          findings.push({ channel: ch, mission: r.mission.id, check: c });
      }
  }
  const certification = macCertification({
    channels: Object.fromEntries(
      Object.entries(results).map(([ch, r]) => [
        ch,
        {
          receipts: r.receipts.map(x => x.receipt),
          identity: r.identity,
          web: r.web,
          latestPublishedVersion: r.latestPublishedVersion,
        },
      ])
    ),
    generatedAt: new Date().toISOString(),
  });
  writeFileSync(
    path.join(args.out, 'certification.json'),
    `${JSON.stringify(certification, null, 2)}\n`
  );
  writeFileSync(
    path.join(args.out, 'receipts.json'),
    `${JSON.stringify(
      Object.values(results).flatMap(r => r.receipts.map(x => x.receipt)),
      null,
      2
    )}\n`
  );
  writeFileSync(
    path.join(args.out, 'checks.json'),
    `${JSON.stringify(allChecks, null, 2)}\n`
  );
  writeFileSync(
    path.join(args.out, 'findings.json'),
    `${JSON.stringify(findings, null, 2)}\n`
  );
  writeFileSync(
    path.join(args.out, 'run.json'),
    `${JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([ch, r]) => [
          ch,
          {
            identity: r.identity,
            web: r.web,
            sessionKind: r.sessionKind,
            latestPublishedVersion: r.latestPublishedVersion,
            startedAt: r.startedAt,
            completedAt: r.completedAt,
          },
        ])
      ),
      null,
      2
    )}\n`
  );
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    `${JSON.stringify({ completedAt: new Date().toISOString(), installed: Object.fromEntries(Object.entries(results).map(([ch, r]) => [ch, { version: r.identity?.version ?? null, sourceRevision: r.identity?.sourceRevision ?? null }])), latest: Object.fromEntries(Object.entries(results).map(([ch, r]) => [ch, r.latestPublishedVersion])) }, null, 2)}\n`
  );
  const runDoc = Object.fromEntries(
    Object.entries(results).map(([ch, r]) => [
      ch,
      {
        identity: r.identity,
        web: r.web,
        sessionKind: r.sessionKind,
        latestPublishedVersion: r.latestPublishedVersion,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      },
    ])
  );
  const status = macStatusDoc({ certification, run: runDoc });
  writeFileSync(
    path.join(args.out, 'mac-status.json'),
    `${JSON.stringify(status, null, 2)}\n`
  );
  if (args.statusGist) {
    try {
      execFileSync(
        'gh',
        [
          'api',
          '-X',
          'PATCH',
          `gists/${args.statusGist}`,
          '-F',
          `files[mac-status.json][content]=@${path.join(args.out, 'mac-status.json')}`,
        ],
        { stdio: 'pipe', timeout: 60_000 }
      );
    } catch (err) {
      console.error(`status gist publish failed: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(
    `certified ${certification.certified}/${certification.total}; findings ${findings.length}; out ${args.out}`
  );
  process.exitCode = findings.length ? 2 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
