#!/usr/bin/env node
// Mac visual QA: drive the installed Jovie desktop app through a route list,
// capture real window pixels (native traffic lights, title bar, vibrancy), and
// diff each capture against the last approved baseline.
//
//   node scripts/desktop/visual-qa.mjs                  # run now (staging app)
//   node scripts/desktop/visual-qa.mjs --if-new-version # LaunchAgent mode
//   node scripts/desktop/visual-qa.mjs --approve        # promote last run to baseline
//   node scripts/desktop/visual-qa.mjs --linear         # file findings (LINEAR_API_KEY)
//
// Web screenshots cannot see the native chrome, so this runs on a signed-in
// Mac (see scripts/desktop/install-visual-qa.sh), never on a CI runner.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import {
  APP_TARGETS,
  buildRouteDeepLink,
  captureName,
  classifyCapture,
  DEFAULT_SIZES,
  diffRgba,
  findingsFrom,
  parseHidIdleSeconds,
  renderMarkdownReport,
} from './visual-qa-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    target: { type: 'string', default: 'staging' },
    routes: { type: 'string', default: join(here, 'visual-qa.routes.json') },
    state: {
      type: 'string',
      default: join(homedir(), '.local/state/jovie-mac-visual-qa'),
    },
    'if-new-version': { type: 'boolean', default: false },
    'min-idle': { type: 'string', default: '300' },
    settle: { type: 'string', default: '6' },
    threshold: { type: 'string', default: '0.02' },
    'restore-route': { type: 'string', default: '/app' },
    approve: { type: 'boolean', default: false },
    linear: { type: 'boolean', default: false },
  },
});

const target = APP_TARGETS[args.target];
if (!target) throw new Error(`visual-qa: unknown --target ${args.target}`);
const threshold = Number(args.threshold);
const baselineDir = join(args.state, args.target, 'baseline');
const runsDir = join(args.state, args.target, 'runs');
const lastVersionFile = join(args.state, args.target, 'last-version');

function log(message) {
  process.stdout.write(`[visual-qa] ${message}\n`);
}

function sleep(seconds) {
  return new Promise(done => setTimeout(done, seconds * 1000));
}

function appVersion() {
  return execFileSync(
    'plutil',
    [
      '-extract',
      'CFBundleVersion',
      'raw',
      join(target.appPath, 'Contents/Info.plist'),
    ],
    { encoding: 'utf8' }
  ).trim();
}

function idleSeconds() {
  return parseHidIdleSeconds(
    execFileSync('ioreg', ['-c', 'IOHIDSystem', '-d', '4'], {
      encoding: 'utf8',
    })
  );
}

function frontmostBundleId() {
  const asn = execFileSync('lsappinfo', ['front'], { encoding: 'utf8' }).trim();
  const info = execFileSync('lsappinfo', ['info', '-only', 'bundleid', asn], {
    encoding: 'utf8',
  });
  return /"CFBundleIdentifier"="([^"]+)"/.exec(info)?.[1] ?? null;
}

/** Largest on-screen layer-0 window owned by the app (the main BrowserWindow). */
function mainWindow() {
  const script = `ObjC.import("CoreGraphics");
const all = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)));
JSON.stringify(all.filter(w => w.kCGWindowOwnerName === ${JSON.stringify(target.ownerName)} && w.kCGWindowLayer === 0)
  .map(w => ({ id: w.kCGWindowNumber, pid: w.kCGWindowOwnerPID, title: w.kCGWindowName || '', bounds: w.kCGWindowBounds })));`;
  const windows = JSON.parse(
    execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
    })
  );
  windows.sort(
    (a, b) =>
      b.bounds.Width * b.bounds.Height - a.bounds.Width * a.bounds.Height
  );
  return windows[0] ?? null;
}

function hasCuaDriver() {
  return (
    spawnSync('cua-driver', ['--version'], { stdio: 'ignore' }).status === 0
  );
}

function setFrame(win, size) {
  const result = spawnSync(
    'cua-driver',
    [
      'set_window_frame',
      JSON.stringify({
        pid: win.pid,
        window_id: win.id,
        x: win.bounds.X,
        y: win.bounds.Y,
        width: size.width,
        height: size.height,
      }),
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0)
    throw new Error(`set_window_frame failed: ${result.stderr}`);
}

function openRoute(route) {
  // -g keeps the launch in the background; the app still raises its window.
  execFileSync('open', ['-g', buildRouteDeepLink(target.scheme, route)]);
}

async function rgba(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function compare(captureFile, baselineFile) {
  if (!existsSync(baselineFile)) return { status: 'new', diff: null };
  const [current, baseline] = await Promise.all([
    rgba(captureFile),
    rgba(baselineFile),
  ]);
  if (current.width !== baseline.width || current.height !== baseline.height) {
    return { status: 'resized', diff: null };
  }
  const diff = diffRgba(current.data, baseline.data, {
    width: current.width,
    height: current.height,
  });
  return { status: classifyCapture({ baseline: true, diff, threshold }), diff };
}

function latestRun() {
  if (!existsSync(runsDir)) return null;
  const runs = readdirSync(runsDir)
    .map(name => join(runsDir, name))
    .filter(path => statSync(path).isDirectory())
    .sort();
  return runs.at(-1) ?? null;
}

function approve() {
  const run = latestRun();
  if (!run) throw new Error('visual-qa: no run to approve');
  rmSync(baselineDir, { recursive: true, force: true });
  mkdirSync(baselineDir, { recursive: true });
  for (const file of readdirSync(run).filter(name => name.endsWith('.png'))) {
    copyFileSync(join(run, file), join(baselineDir, file));
  }
  log(`approved ${run} as the ${args.target} baseline`);
}

async function linearRequest(query, variables) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: process.env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(
      `Linear request failed: ${JSON.stringify(body.errors ?? body)}`
    );
  }
  return body.data;
}

async function uploadToLinear(file) {
  const bytes = readFileSync(file);
  const data = await linearRequest(
    `mutation($size: Int!, $name: String!) {
      fileUpload(contentType: "image/png", filename: $name, size: $size) {
        uploadFile { uploadUrl assetUrl headers { key value } }
      }
    }`,
    { size: bytes.length, name: file.split('/').at(-1) }
  );
  const upload = data.fileUpload.uploadFile;
  const headers = {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=31536000',
  };
  for (const header of upload.headers) headers[header.key] = header.value;
  const put = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers,
    body: bytes,
  });
  if (!put.ok) throw new Error(`Linear upload failed: ${put.status}`);
  return upload.assetUrl;
}

async function fileLinearIssue({ version, runDir, results }) {
  if (!process.env.LINEAR_API_KEY) {
    log('LINEAR_API_KEY missing; findings stay in the local report');
    return;
  }
  const findings = findingsFrom(results);
  if (findings.length === 0) return;
  const teamKey = process.env.LINEAR_TEAM_KEY ?? 'JOV';
  const lookup = await linearRequest(
    `query($key: String!) {
      teams(filter: { key: { eq: $key } }) { nodes { id } }
      issueLabels(filter: { name: { eq: "mac-visual-qa" } }) { nodes { id } }
    }`,
    { key: teamKey }
  );
  const teamId = lookup.teams.nodes[0]?.id;
  if (!teamId) throw new Error(`Linear team ${teamKey} not found`);
  let labelId = lookup.issueLabels.nodes[0]?.id;
  if (!labelId) {
    const created = await linearRequest(
      `mutation($teamId: String!) {
        issueLabelCreate(input: { name: "mac-visual-qa", teamId: $teamId }) { issueLabel { id } }
      }`,
      { teamId }
    );
    labelId = created.issueLabelCreate.issueLabel.id;
  }
  const sections = [];
  for (const finding of findings) {
    const assetUrl = await uploadToLinear(join(runDir, finding.name));
    const ratio = finding.diff
      ? `${(finding.diff.changedRatio * 100).toFixed(2)}% changed`
      : finding.status;
    sections.push(
      `### ${finding.surface} (${finding.size})\n\n\`${finding.route}\`, ${ratio}\n\n![${finding.name}](${assetUrl})`
    );
  }
  const description = [
    `The Mac visual QA pass found ${findings.length} capture(s) that moved past the approved baseline on ${target.ownerName} ${version}.`,
    'Decide per capture: a bug gets fixed; an intended change gets approved with `node scripts/desktop/visual-qa.mjs --approve` on the QA Mac.',
    '',
    ...sections,
  ].join('\n');
  const issue = await linearRequest(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }`,
    {
      input: {
        teamId,
        labelIds: [labelId],
        title: `Mac visual QA: ${findings.length} change(s) on ${target.ownerName} ${version}`,
        description,
      },
    }
  );
  log(
    `filed ${issue.issueCreate.issue.identifier} ${issue.issueCreate.issue.url}`
  );
}

async function run() {
  if (!existsSync(target.appPath))
    throw new Error(`visual-qa: ${target.appPath} is not installed`);
  const version = appVersion();
  mkdirSync(dirname(lastVersionFile), { recursive: true });
  if (args['if-new-version'] && existsSync(lastVersionFile)) {
    if (readFileSync(lastVersionFile, 'utf8').trim() === version) return;
  }

  const idle = idleSeconds();
  const minIdle = Number(args['min-idle']);
  if (idle !== null && idle < minIdle) {
    log(`deferred: user active ${idle}s ago (needs ${minIdle}s idle)`);
    return;
  }

  let win = mainWindow();
  if (!win) {
    log(`deferred: ${target.ownerName} has no on-screen window`);
    return;
  }

  const { routes } = JSON.parse(readFileSync(args.routes, 'utf8'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(runsDir, `${stamp}_${version}`);
  mkdirSync(runDir, { recursive: true });
  const previousFront = frontmostBundleId();
  const originalBounds = { ...win.bounds };
  const resizable = hasCuaDriver();
  const sizes = resizable
    ? DEFAULT_SIZES
    : [{ name: 'current', width: win.bounds.Width, height: win.bounds.Height }];
  const results = [];

  try {
    for (const size of sizes) {
      if (resizable) setFrame(win, size);
      for (const { route, surface } of routes) {
        const name = captureName(route, size);
        try {
          openRoute(route);
          await sleep(Number(args.settle));
          win = mainWindow() ?? win;
          if (/sign in/i.test(win.title)) {
            throw new Error('signed out: the app is showing sign-in');
          }
          const file = join(runDir, name);
          execFileSync('screencapture', [
            '-x',
            '-o',
            '-l',
            String(win.id),
            file,
          ]);
          const { status, diff } = await compare(file, join(baselineDir, name));
          results.push({ name, route, surface, size: size.name, status, diff });
        } catch (error) {
          results.push({
            name,
            route,
            surface,
            size: size.name,
            status: 'error',
            diff: null,
            error: String(error),
          });
        }
      }
    }
  } finally {
    if (resizable) {
      setFrame(win, {
        width: originalBounds.Width,
        height: originalBounds.Height,
      });
    }
    openRoute(args['restore-route']);
    if (previousFront && previousFront !== target.bundleId) {
      spawnSync('open', ['-b', previousFront]);
    }
  }

  const report = renderMarkdownReport({
    appName: target.ownerName,
    version,
    results,
    threshold,
  });
  writeFileSync(join(runDir, 'report.md'), report);
  writeFileSync(
    join(runDir, 'results.json'),
    `${JSON.stringify({ version, results }, null, 2)}\n`
  );
  writeFileSync(lastVersionFile, `${version}\n`);
  log(`wrote ${runDir}`);
  process.stdout.write(report);

  if (!existsSync(baselineDir)) {
    log('no baseline yet; review this run, then approve it with --approve');
  }
  if (args.linear) await fileLinearIssue({ version, runDir, results });
}

if (args.approve) approve();
else await run();
