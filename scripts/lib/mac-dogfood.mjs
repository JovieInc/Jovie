// Mac app dogfood core: journeys, assertions, receipts, certification, findings.
// Pure (no I/O); the cua-driver loop lives in scripts/mac-dogfood.mjs.
//
// The customer Mac app is Electron (apps/desktop) loading the hosted web app, so
// a Mac receipt binds TWO builds: the packaged shell (build-identity.json) and
// the web build it loaded. Receipts reuse jovie.dogfood-receipt/v1 with kind
// `mac_closed_loop` (docs/design-system/CERTIFICATION_V2_DOGFOOD.md section 4).
//
// Read-only by construction: the runner may only press labels in SAFE_PRESS.
import {
  fingerprintFor,
  RECEIPT_SCHEMA,
  SEVERITY,
  weeklyDefectMetrics,
} from './prod-dogfood.mjs';

export const MAC_CERTIFICATION_SCHEMA = 'jovie.mac-dogfood-certification/v1';
export const FULL_SHA = /^[0-9a-f]{40}$/;

/** Bundle ids per release lane (apps/desktop/SIGNING.md). */
export const MAC_CHANNELS = {
  production: {
    bundleId: 'app.jov.ie',
    appPath: '/Applications/Jovie.app',
    supportDir: 'Jovie',
    webOrigin: 'https://jov.ie',
    versionRe: /^\d+\.\d+\.\d+$/,
  },
  staging: {
    bundleId: 'app.jov.ie.staging',
    appPath: '/Applications/Jovie Staging.app',
    supportDir: 'Jovie-Staging',
    webOrigin: 'https://staging.jov.ie',
    versionRe: /^\d+\.\d+\.\d+-staging\.[1-9]\d*\.[1-9]\d*$/,
  },
};

/**
 * The only controls the runner may press. Navigation and disclosure only:
 * never Download / Restart To Update / Approve / Send / Add / Cancel Sign-in.
 */
export const SAFE_PRESS = new Set([
  'Inbox',
  'Identity',
  'Work',
  'Audience',
  'New Chat',
  'Other Sign-in Options',
  'Switch Workspace',
  'Jovie',
  'OV',
  'Later',
]);

/**
 * Journey registry. `needs` is the session the journey requires; a journey whose
 * session is not available is `uncertified:blocked` with the exact capability.
 */
export const MAC_MISSIONS = [
  {
    id: 'dogfood:mac-launch',
    subjectId: 'journey:macos',
    product: 'jov',
    title:
      'Mac app launches from the installed bundle with verified provenance',
    needs: 'any',
    checks: ['build-identity', 'window-ready', 'launch-readiness'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:mac-signin',
    subjectId: 'journey:macos',
    product: 'jov',
    title: 'Signed-out Mac app offers every sign-in route',
    needs: 'signed-out',
    checks: ['signin-surface', 'signin-options'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:mac-shell',
    subjectId: 'journey:macos',
    product: 'jov',
    title: 'Signed-in shell opens Inbox, Identity, Work and Audience',
    needs: 'signed-in',
    checks: ['shell-nav', 'inbox-label', 'shell-clean'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:mac-chat',
    subjectId: 'journey:chat-agent-turn',
    product: 'jov',
    title: 'Chat composer is present and editable (no turn is sent)',
    needs: 'signed-in',
    checks: ['composer-ready'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:mac-ovie-shipping',
    subjectId: 'journey:ovie-shipping',
    product: 'ovie',
    title: 'Ovie Home reports shipping state without a false all-clear',
    needs: 'admin',
    checks: ['ovie-no-false-green'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:mac-update',
    subjectId: 'journey:macos',
    product: 'jov',
    title: 'Update prompt is coherent and never leaves a half state',
    needs: 'any',
    checks: ['update-prompt'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:mac-summer-turn',
    subjectId: 'journey:chat-agent-turn',
    product: 'jov',
    title: 'A chat turn to Summer streams a visible answer and persists',
    needs: 'sanctioned',
    checks: [],
    automation: 'blocked',
    blocker:
      'Sending a turn writes to the account. Needs the sanctioned synthetic account signed into the Mac app (desktop-auth code from a headless sign-in of the creator-ready identity) plus a self-cleaning thread delete.',
    owner: 'mac-dogfood',
  },
  {
    id: 'dogfood:mac-notifications',
    subjectId: 'journey:macos',
    product: 'jov',
    title: 'A native notification banner appears and opens the right view',
    needs: 'sanctioned',
    checks: [],
    automation: 'blocked',
    blocker:
      'The in-app bell is covered by mac-shell. A native banner needs a trigger that is safe to fire (synthetic push to the sanctioned account) and Notification Center accessibility reads, which cua-driver has not been granted.',
    owner: 'mac-dogfood',
  },
  {
    id: 'dogfood:mac-tray-hud',
    subjectId: 'journey:macos',
    product: 'ovie',
    title: 'Menu bar tray and Ovie HUD door open the right surface',
    needs: 'any',
    checks: [],
    automation: 'blocked',
    blocker:
      'The tray is a status item outside the app window; reading it needs the menu-bar extras accessibility scope for the running app. Prototype it with cua-driver invoke_menu on the app menu (Ovie, Talk) once those doors are stable.',
    owner: 'mac-dogfood',
  },
  {
    id: 'dogfood:mac-auto-install',
    subjectId: 'journey:macos',
    product: 'jov',
    title: 'Restart To Update installs the new build and relaunches signed in',
    needs: 'sanctioned',
    checks: [],
    automation: 'blocked',
    blocker:
      'Installing replaces the bundle on the host. Needs a dedicated Mac (not Tim’s) or a throwaway copy of the app in a scratch directory with its own userData; verified by build-identity changing and the session surviving.',
    owner: 'mac-dogfood',
  },
];

export const MAC_INVARIANT_PROPOSALS = {
  'build-identity':
    'Invariant: every shipped desktop bundle carries a build-identity.json whose channel matches its bundle id, version matches the channel pattern, and sourceRevision is a full commit sha (provenance verified).',
  'window-ready':
    'Invariant: launching the installed bundle yields a visible main window with a web area within the measured start budget.',
  'launch-readiness':
    'Invariant: desktop-launch-readiness.json reports verified provenance and a non-null composerVisibleEditable mark on every launch; stage times are tracked p50/p95.',
  'signin-surface':
    'Invariant: a signed-out launch shows a sign-in surface with a primary continue action.',
  'signin-options':
    'Invariant: the sign-in surface reaches Copy Sign-in Link, Enter A Code and Scan With Phone.',
  'shell-nav':
    'Invariant: each primary sidebar destination opens a window whose title and heading match the destination, with no error or stuck-loading state.',
  'inbox-label':
    'Invariant: counted labels pluralize correctly ("1 Item", "2 Items"); an accessibility label never reads "1 Items".',
  'shell-clean':
    'Invariant: no primary Mac shell view shows an error shell or "could not load" copy.',
  'composer-ready':
    'Invariant: the chat composer is a labeled, editable text area on every signed-in launch.',
  'ovie-no-false-green':
    'Invariant: Ovie Home never shows the all-clear ("Nothing is blocking shipping") while any shipping section failed to load or every metric is unmeasured; unknown renders as unknown.',
  'update-prompt':
    'Invariant: an update prompt names the version, offers Later and a primary action, and Restart To Update only appears after the download reached Ready.',
};

const NEXT_STEP = {
  'ovie-no-false-green':
    'Render the unknown/error state in the shipping constraint banner whenever the loop section is not ready; do not fall back to the all-clear copy.',
  'inbox-label':
    'Pluralize the Inbox bell label by count in apps/web/components/shell/SidebarInboxLink.tsx and cover 1, 2 and 0.',
};

// ---------- snapshots ----------

/**
 * Normalize a cua-driver get_window_state payload. Drops the system menu bar
 * (it lists the host's recent files) and everything after it; keeps role+label.
 */
export function normalizeSnapshot(state) {
  const elements = [];
  for (const e of state?.elements ?? []) {
    if (e.role === 'AXMenuBar') break;
    elements.push({
      role: e.role ?? '',
      label: String(e.label ?? e.title ?? e.value ?? ''),
      token: e.element_token ?? null,
    });
  }
  return { title: String(state?.window_title ?? ''), elements };
}

const find = (snap, role, label) =>
  snap.elements.find(
    e =>
      (role == null || e.role === role) &&
      (label instanceof RegExp ? label.test(e.label) : e.label === label)
  );

/** signed-out | signed-in | unknown, from the window contents alone. */
export function classifySession(snap) {
  if (!snap) return 'unknown';
  if (
    find(snap, 'AXHeading', /^Finish Signing In$/) ||
    find(snap, 'AXButton', 'Continue In Browser')
  )
    return 'signed-out';
  if (
    find(snap, 'AXTextArea', 'Chat Message Input') ||
    find(snap, 'AXLink', 'Inbox')
  )
    return 'signed-in';
  return 'unknown';
}

// ---------- checks ----------

const pass = (id, target, summary) => ({
  id,
  target,
  status: 'passed',
  summary,
});
const fail = (id, target, summary, expected, actual, severity = 'P2') => ({
  id,
  target,
  status: 'failed',
  severity,
  summary,
  expected,
  actual,
});
const unverified = (id, target, summary) => ({
  id,
  target,
  status: 'unverified',
  summary,
});

export function evalBuildIdentity({ identity, channel }) {
  const target = `desktop:${channel}`;
  const cfg = MAC_CHANNELS[channel];
  if (!identity)
    return fail(
      'build-identity',
      target,
      'installed bundle has no readable build identity',
      'Resources/build-identity.json present and valid',
      'missing or unreadable',
      'P1'
    );
  const problems = [];
  if (identity.channel !== channel)
    problems.push(`channel ${identity.channel} != ${channel}`);
  if (!cfg.versionRe.test(identity.version ?? ''))
    problems.push(
      `version ${identity.version} does not match the ${channel} pattern`
    );
  if (!FULL_SHA.test(identity.sourceRevision ?? ''))
    problems.push('sourceRevision is not a full commit sha');
  if (problems.length)
    return fail(
      'build-identity',
      target,
      `build identity invalid: ${problems.join('; ')}`,
      'channel, version pattern and full sourceRevision all valid',
      problems.join('; '),
      'P1'
    );
  return pass(
    'build-identity',
    target,
    `${identity.version} @ ${identity.sourceRevision.slice(0, 8)}`
  );
}

export function evalWindowReady({ windows, channel, waitedMs }) {
  const target = `desktop:${channel}`;
  const main = (windows ?? []).filter(w => (w.bounds?.height ?? 0) > 40);
  if (main.length === 0)
    return fail(
      'window-ready',
      target,
      `no main window after ${waitedMs}ms`,
      'a visible main window',
      '0 windows taller than the title strip',
      'P1'
    );
  return pass('window-ready', target, `main window up after ${waitedMs}ms`);
}

/** Stage times from the app's own desktop-launch-readiness.json (measured, not gated). */
export function evalLaunchReadiness({ readiness, channel }) {
  const target = `desktop:${channel}`;
  if (!readiness)
    return unverified(
      'launch-readiness',
      target,
      'no desktop-launch-readiness.json yet'
    );
  if (readiness.nativeBuild?.provenance !== 'verified')
    return fail(
      'launch-readiness',
      target,
      'launch readiness reports unverified provenance',
      'nativeBuild.provenance === "verified"',
      String(readiness.nativeBuild?.provenance),
      'P1'
    );
  if (readiness.composerVisibleEditableAfterPaintOpportunityMs == null)
    return fail(
      'launch-readiness',
      target,
      'composer never became visible and editable',
      'composerVisibleEditableAfterPaintOpportunityMs recorded',
      'null',
      'P1'
    );
  return pass(
    'launch-readiness',
    target,
    `window ${Math.round(readiness.nativeWindowReadyToShowMs)}ms, react ${Math.round(readiness.reactMountedMs)}ms, composer ${Math.round(readiness.composerVisibleEditableAfterPaintOpportunityMs)}ms`
  );
}

export function evalSignInSurface(snap, channel) {
  const target = `desktop:${channel}:signin`;
  if (
    find(snap, 'AXButton', 'Continue In Browser') &&
    find(snap, 'AXButton', 'Other Sign-in Options')
  )
    return pass(
      'signin-surface',
      target,
      'sign-in surface with continue and other options'
    );
  return fail(
    'signin-surface',
    target,
    'signed-out launch has no sign-in actions',
    'Continue In Browser and Other Sign-in Options',
    snap.elements
      .filter(e => e.role === 'AXButton')
      .map(e => e.label)
      .join(', ') || 'no buttons',
    'P1'
  );
}

export function evalSignInOptions(snap, channel) {
  const target = `desktop:${channel}:signin-options`;
  const want = ['Copy Sign-in Link', 'Enter A Code', 'Scan With Phone'];
  const missing = want.filter(l => !find(snap, 'AXButton', l));
  if (missing.length === 0)
    return pass('signin-options', target, 'all three routes offered');
  return fail(
    'signin-options',
    target,
    `sign-in options missing: ${missing.join(', ')}`,
    want.join(', '),
    `missing ${missing.join(', ')}`,
    'P1'
  );
}

const NAV = [
  { label: 'Inbox', title: /^Home\b/, heading: /^Home$/ },
  { label: 'Identity', title: /^Profiles\b/, heading: /^Profiles$/ },
  { label: 'Work', title: /^Work\b/, heading: /^Work$/ },
  { label: 'Audience', title: /^Audience\b/, heading: /^Audience$/ },
];
export const SHELL_NAV = NAV;

const ERROR_COPY =
  /could not load|something went wrong|application error|page not found|^404\b/i;

/** visits: {Inbox: snap, Identity: snap, ...} captured after pressing each destination. */
export function evalShellNav(visits, channel) {
  const out = [];
  for (const n of NAV) {
    const snap = visits[n.label];
    const target = `desktop:${channel}:${n.label.toLowerCase()}`;
    if (!snap) {
      out.push(unverified('shell-nav', target, `${n.label} was not visited`));
      continue;
    }
    const heading = snap.elements.find(
      e => e.role === 'AXHeading' && n.heading.test(e.label)
    );
    if (n.title.test(snap.title) && heading)
      out.push(pass('shell-nav', target, `${n.label} opened "${snap.title}"`));
    else
      out.push(
        fail(
          'shell-nav',
          target,
          `${n.label} did not open its view`,
          `window title ${n.title} and heading ${n.heading}`,
          `title "${snap.title}", headings: ${
            snap.elements
              .filter(e => e.role === 'AXHeading')
              .map(e => e.label)
              .slice(0, 4)
              .join(' | ') || 'none'
          }`
        )
      );
  }
  return out;
}

export function evalShellClean(visits, channel) {
  const out = [];
  for (const [name, snap] of Object.entries(visits)) {
    const target = `desktop:${channel}:${name.toLowerCase()}`;
    const bad = snap.elements.find(
      e => e.role !== 'AXTextArea' && ERROR_COPY.test(e.label)
    );
    out.push(
      bad
        ? fail(
            'shell-clean',
            target,
            `${name} shows error copy`,
            'no error shell',
            `"${bad.label.slice(0, 80)}"`
          )
        : pass('shell-clean', target, `${name} clean`)
    );
  }
  return out;
}

/** "1 Items" is a counted-label pluralization defect. */
export function evalInboxLabel(snap, channel) {
  const target = `desktop:${channel}:inbox-label`;
  const link = snap.elements.find(e => /^Inbox\b.*\d+ Items?\b/.test(e.label));
  if (!link)
    return pass('inbox-label', target, 'no counted inbox label to check');
  const m = /(\d+) (Items?)\b/.exec(link.label);
  const n = Number(m[1]);
  const ok = n === 1 ? m[2] === 'Item' : m[2] === 'Items';
  return ok
    ? pass('inbox-label', target, `label pluralizes (${m[0]})`)
    : fail(
        'inbox-label',
        target,
        `inbox label reads "${m[0]}"`,
        n === 1 ? '1 Item' : `${n} Items`,
        `"${link.label}"`,
        'P3'
      );
}

export function evalComposer(snap, channel) {
  const target = `desktop:${channel}:composer`;
  const area = find(snap, 'AXTextArea', 'Chat Message Input');
  return area
    ? pass('composer-ready', target, 'Chat Message Input text area present')
    : fail(
        'composer-ready',
        target,
        'chat composer text area missing',
        'AXTextArea "Chat Message Input"',
        `${snap.elements.length} elements, none a chat input`,
        'P1'
      );
}

/** Ovie Home has left its skeletons once the pulse tiles carry their labels. */
export function ovieSettled(snap) {
  return Boolean(
    find(snap, 'AXStaticText', 'Prod') && find(snap, 'AXStaticText', 'Queue')
  );
}

/** A sidebar destination is open when the window title and heading both match. */
export function navMatches(label, snap) {
  const n = NAV.find(x => x.label === label);
  return Boolean(
    n &&
      n.title.test(snap.title) &&
      snap.elements.some(e => e.role === 'AXHeading' && n.heading.test(e.label))
  );
}

/**
 * Ovie Home: the all-clear must not render while a section reports it could not
 * load or every metric is unmeasured (unknown is not healthy).
 */
export function evalOvieNoFalseGreen(snap, channel) {
  const target = `desktop:${channel}:ovie-home`;
  if (!ovieSettled(snap))
    return unverified(
      'ovie-no-false-green',
      target,
      'Ovie Home had not finished loading, so nothing was asserted'
    );
  if (!find(snap, 'AXStaticText', /^Nothing is blocking shipping$/))
    return pass('ovie-no-false-green', target, 'no all-clear shown');
  const loadErrors = snap.elements.filter(
    e => e.role === 'AXStaticText' && /could not load/i.test(e.label)
  ).length;
  const unmeasured = snap.elements.filter(
    e => e.role === 'AXStaticText' && e.label === 'Not measured'
  ).length;
  if (loadErrors > 0 || unmeasured >= 3)
    return fail(
      'ovie-no-false-green',
      target,
      'Ovie Home says "Nothing is blocking shipping" while shipping data is unknown',
      'unknown state when sections fail to load or metrics are unmeasured',
      `all-clear shown with ${loadErrors} "could not load" section(s) and ${unmeasured} "Not measured" tile(s)`,
      'P2'
    );
  return pass(
    'ovie-no-false-green',
    target,
    'all-clear backed by measured data'
  );
}

export function evalUpdatePrompt(snap, channel, installedVersion) {
  const target = `desktop:${channel}:update`;
  const heading = snap.elements.find(
    e =>
      e.role === 'AXHeading' &&
      /^(Downloading )?Jovie \S+( Is (Available|Ready))?$/.test(e.label)
  );
  const banner = find(snap, 'AXButton', 'Restart to update');
  if (!heading && !banner)
    return pass('update-prompt', target, 'no update pending');
  const ready = heading ? /Is Ready$/.test(heading.label) : true;
  const problems = [];
  if (heading && /Is Available$/.test(heading.label)) {
    if (!find(snap, 'AXButton', 'Later') || !find(snap, 'AXButton', 'Download'))
      problems.push('Available prompt lacks Later or Download');
  }
  if (heading && /Is Ready$/.test(heading.label)) {
    if (!find(snap, 'AXButton', 'Restart To Update'))
      problems.push('Ready prompt lacks Restart To Update');
  }
  if (find(snap, 'AXButton', 'Restart To Update') && !ready)
    problems.push('Restart To Update offered before the download was ready');
  const ver = heading && /Jovie (\S+)/.exec(heading.label)?.[1];
  if (ver && installedVersion && ver === installedVersion)
    problems.push(`prompt offers the installed version ${ver}`);
  return problems.length
    ? fail(
        'update-prompt',
        target,
        `update prompt incoherent: ${problems.join('; ')}`,
        'coherent update prompt',
        problems.join('; ')
      )
    : pass(
        'update-prompt',
        target,
        heading ? heading.label : 'update banner present'
      );
}

// ---------- receipts & certification ----------

const ADVISORY = new Set(['vision-review', 'launch-readiness']);

export function outcomeOf(checks, mission) {
  if (mission.automation === 'blocked' || checks.length === 0) return 'blocked';
  if (checks.some(c => c.status === 'failed')) return 'failed';
  if (checks.some(c => c.status === 'unverified' && !ADVISORY.has(c.id)))
    return 'blocked';
  return 'passed';
}

/**
 * One receipt per mission run, bound to the packaged build (sourceRevision) and
 * to the web build it loaded. No account identity, chat text or screenshots of
 * a founder session are retained.
 */
export function buildMacReceipt({
  mission,
  checks,
  channel,
  identity,
  web,
  sessionKind,
  startedAt,
  completedAt,
  evidenceRefs = [],
  actor = 'mac-dogfood-agent',
}) {
  const outcome = outcomeOf(checks, mission);
  const failed = checks.filter(c => c.status === 'failed');
  let blocker = null;
  if (mission.automation === 'blocked') blocker = mission.blocker;
  else if (outcome === 'failed')
    blocker = `${failed.length} failed check(s): ${[...new Set(failed.map(c => c.id))].join(', ')}`;
  else if (outcome === 'blocked')
    blocker =
      checks.find(c => c.status === 'unverified')?.summary ??
      'a required check was unverified';
  const sha = identity?.sourceRevision ?? '';
  return {
    schema: RECEIPT_SCHEMA,
    subjectId: mission.subjectId,
    product: mission.product,
    kind: 'mac_closed_loop',
    driver: 'cli',
    missionId: mission.id,
    actor,
    environment: channel,
    deploymentId: `desktop-${identity?.version ?? 'unknown'}+web-${(web?.commitSha ?? 'unknown').slice(0, 12)}`,
    commitSha: FULL_SHA.test(sha) ? sha : '0'.repeat(40),
    flagCohort: sessionKind ?? 'unknown',
    startedAt,
    completedAt,
    outcome: FULL_SHA.test(sha) ? outcome : 'blocked',
    blocker: FULL_SHA.test(sha)
      ? blocker
      : 'desktop build provenance unverified (no full sourceRevision)',
    evidenceRefs: evidenceRefs.length ? evidenceRefs : [`checks:${mission.id}`],
    invocation: null,
    privacy: {
      conversationContentRetained: false,
      credentialsRetained: false,
      accountIdentityRetained: false,
      unrelatedPersonalDataRetained: false,
    },
  };
}

/**
 * Roll-up per channel. Certified only on a passed receipt for the build that is
 * installed now; a newer published build with no receipt is `uncertified:stale-build`.
 */
export function macCertification({ channels, generatedAt }) {
  const rows = [];
  for (const [channel, c] of Object.entries(channels)) {
    for (const m of MAC_MISSIONS) {
      const r = (c.receipts ?? []).find(x => x.missionId === m.id);
      let status;
      if (m.automation === 'blocked') status = 'uncertified:blocked';
      else if (!r) status = 'uncertified:blocked';
      else if (r.outcome === 'failed') status = 'failing';
      else if (r.outcome === 'blocked') status = 'uncertified:blocked';
      else if (
        c.latestPublishedVersion &&
        c.identity?.version !== c.latestPublishedVersion
      )
        status = 'uncertified:stale-build';
      else status = 'certified';
      rows.push({
        channel,
        missionId: m.id,
        title: m.title,
        status,
        desktopVersion: c.identity?.version ?? null,
        sourceRevision: c.identity?.sourceRevision ?? null,
        webCommitSha: c.web?.commitSha ?? null,
        completedAt: r?.completedAt ?? null,
        blocker:
          status === 'certified' ? null : (r?.blocker ?? m.blocker ?? null),
      });
    }
  }
  return {
    schema: MAC_CERTIFICATION_SCHEMA,
    generatedAt,
    certified: rows.filter(r => r.status === 'certified').length,
    total: rows.length,
    rows,
  };
}

// ---------- findings ----------

/** One defect = one issue across release lanes: the fingerprint ignores the channel. */
export function macTargetKey(target) {
  return String(target).replace(/^desktop:[a-z]+:/, 'desktop:');
}

/** `observed` lists every lane where the check failed: [{channel, identity, web}]. */
export function macFindingIssue({ check, mission, observed, runNote }) {
  const fp = fingerprintFor({
    mission: mission.id,
    check: check.id,
    target: macTargetKey(check.target),
  });
  const sev = SEVERITY[check.severity] ?? SEVERITY.P2;
  const lanes = observed.map(
    o =>
      `- ${o.channel}: desktop ${o.identity?.version ?? 'unknown'} @ ${o.identity?.sourceRevision ?? 'unverified'}; web ${o.web?.commitSha ?? 'unknown'} (${o.web?.environment ?? 'unknown'})`
  );
  const lines = [
    '## Found by the Mac dogfood agent (before a human did)',
    '',
    `- Mission: ${mission.id} (${mission.title})`,
    `- Severity: ${sev.label}`,
    `- Surface: ${macTargetKey(check.target)}`,
    `- Run: ${runNote ?? 'local cua-driver run'}`,
    '',
    '## Observed on (desktop build and the web build it loaded)',
    ...lanes,
    '',
    '## Expected',
    check.expected ?? '',
    '',
    '## Actual',
    check.actual ?? check.summary,
    '',
    '## Next step',
    NEXT_STEP[check.id] ??
      'Reproduce in the installed app (accessibility label above) and fix on the normal path.',
    '',
    '## Invariant / regression check to add with the fix',
    MAC_INVARIANT_PROPOSALS[check.id] ??
      'Add a deterministic Mac dogfood check for this defect class.',
    '',
    'Evidence is the accessibility tree assertion above; founder-session screenshots are never attached. This issue closes itself when the Mac dogfood agent next verifies the check passing on every lane it ran.',
    '',
    `Fingerprint: ${fp}`,
  ];
  return {
    fingerprint: fp,
    title: `[${fp}] ${check.summary}`,
    description: lines.join('\n'),
    priority: sev.priority,
  };
}

/** Agent-found vs Tim-found for Mac defects: label mac-dogfood vs escaped-defect+desktop. */
export function weeklyMacDefectMetrics(issues, opts) {
  const mac = issues.filter(i => {
    const l = i.labels ?? [];
    return (
      l.includes('mac-dogfood') ||
      (l.includes('escaped-defect') &&
        (l.includes('desktop') || l.includes('macOS') || l.includes('mac')))
    );
  });
  return weeklyDefectMetrics(
    mac.map(i => ({
      ...i,
      labels: (i.labels ?? []).map(x =>
        x === 'mac-dogfood' ? 'dogfood-agent' : x
      ),
    })),
    opts
  );
}

/** Dead-man: the newest receipt per channel must be younger than maxStalenessMinutes. */
export function macLiveness({
  certification,
  now = new Date(),
  maxStalenessMinutes,
}) {
  const newest = certification.rows
    .map(r => (r.completedAt ? Date.parse(r.completedAt) : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  if (!newest)
    return {
      alive: false,
      ageMinutes: null,
      reason: 'no Mac dogfood receipt exists',
    };
  const ageMinutes = Math.round((now.getTime() - newest) / 60000);
  return ageMinutes <= maxStalenessMinutes
    ? { alive: true, ageMinutes }
    : {
        alive: false,
        ageMinutes,
        reason: `newest Mac receipt is ${ageMinutes} min old (max ${maxStalenessMinutes})`,
      };
}

/**
 * Public, non-sensitive heartbeat for the automation registry (json-timestamp).
 * Only versions, commit shas and counts: no account, chat or host data.
 */
export function macStatusDoc({ certification, run, now = new Date() }) {
  const byChannel = {};
  for (const [channel, r] of Object.entries(run ?? {})) {
    const rows = certification.rows.filter(x => x.channel === channel);
    byChannel[channel] = {
      desktopVersion: r.identity?.version ?? null,
      sourceRevision: r.identity?.sourceRevision ?? null,
      webCommitSha: r.web?.commitSha ?? null,
      latestPublishedVersion: r.latestPublishedVersion ?? null,
      sessionKind: r.sessionKind,
      certified: rows.filter(x => x.status === 'certified').length,
      failing: rows.filter(x => x.status === 'failing').length,
      blocked: rows.filter(x => x.status.startsWith('uncertified')).length,
      completedAt: r.completedAt ?? null,
    };
  }
  return {
    schema: 'jovie.mac-dogfood-status/v1',
    at: now.toISOString(),
    certified: certification.certified,
    total: certification.total,
    channels: byChannel,
  };
}

/** Seconds since the last keyboard/mouse input, from `ioreg -c IOHIDSystem` output. */
export function parseHidIdleSeconds(ioregText) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(String(ioregText ?? ''));
  return m ? Math.floor(Number(m[1]) / 1e9) : null;
}

/**
 * Tick decision. The runner is event-driven by what it can observe (an installed
 * build changed, a newer build was published) with a time backstop; it never
 * drives the apps while the person is at the keyboard.
 */
export function shouldRun({
  state,
  installed,
  latest,
  now = new Date(),
  maxAgeMinutes,
  idleSeconds,
  requireIdleSeconds,
}) {
  if (idleSeconds != null && idleSeconds < requireIdleSeconds)
    return {
      run: false,
      reason: `user-active (idle ${idleSeconds}s < ${requireIdleSeconds}s)`,
    };
  if (!state?.completedAt) return { run: true, reason: 'first run' };
  for (const ch of Object.keys(installed)) {
    const was = state.installed?.[ch];
    const is = installed[ch];
    if (
      was?.version !== is?.version ||
      was?.sourceRevision !== is?.sourceRevision
    )
      return { run: true, reason: `installed ${ch} build changed` };
    if (latest[ch] && state.latest?.[ch] !== latest[ch])
      return {
        run: true,
        reason: `new ${ch} release published (${latest[ch]})`,
      };
  }
  const ageMin = (now.getTime() - Date.parse(state.completedAt)) / 60000;
  if (ageMin >= maxAgeMinutes)
    return {
      run: true,
      reason: `backstop (${Math.round(ageMin)} min since last run)`,
    };
  return {
    run: false,
    reason: `nothing changed (${Math.round(ageMin)} min since last run)`,
  };
}
