/**
 * Mail send guard: every email goes through the send gateway
 * (apps/web/lib/email/gateway) on a stream declared in
 * apps/web/lib/email/stream-registry.json. Runs inside
 * scripts/external-api-guard.mjs, so the same CI step enforces it.
 *
 * Fails CI on, outside the gateway:
 *   mail-sdk             a mail provider SDK (resend, nodemailer, sendgrid, ses, ...)
 *   mail-host            an HTTP call to a mail provider API (api.resend.com, ...)
 *   smtp                 SMTP transports (smtp:// urls, createTransport, smtplib)
 *   hardcoded-from       a literal sender address (`from: 'x@y'`, `*_FROM_EMAIL = 'x@y'`)
 *   send-without-stream  sendEmail / sendStreamEmail without `stream`, or an email
 *                        sendNotification without `emailRoute`
 *
 * Existing sites are grandfathered per (file, rule) in
 * mail-send-guard.ratchet.gen.json, which only shrinks (`--write`).
 * Contract: docs/company/email-sending-streams.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAIL_RATCHET_PATH = 'scripts/lib/mail-send-guard.ratchet.gen.json';
export const MAIL_RATCHET_SCHEMA = 'jovie-mail-send-ratchet/v1';
export const STREAM_REGISTRY_PATH = 'apps/web/lib/email/stream-registry.json';
const CONTRACT = 'docs/company/email-sending-streams.md';

/** The gateway is the only place allowed to talk to a mail provider. */
export const GATEWAY = [
  /^apps\/web\/lib\/email\/gateway\//,
  // The guard itself lists the hosts and SDKs it forbids.
  /^scripts\/lib\/mail-send-guard\.mjs$/,
];

const CODE = /\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/;
const PY = /\.py$/;
const SHELL = /\.(?:sh|bash)$/;
const YAML = /\.ya?ml$/;
const SCANNED = /\.(?:ts|tsx|js|mjs|cjs|mts|cts|py|sh|bash|ya?ml)$/;
const NOT_SOURCE =
  /(?:\.test\.|\.spec\.|\.stories\.|\.gen\.|\.d\.ts$|(?:^|\/)(?:__tests__|__mocks__|__fixtures__|tests?|fixtures|node_modules|dist|build|\.agents|\.claude)\/)/;

/** Mail provider APIs beyond the ones the stream registry names. */
const KNOWN_MAIL_HOSTS = [
  'api.resend.com',
  'api.sendgrid.com',
  'api.postmarkapp.com',
  'api.mailgun.net',
  'api.eu.mailgun.net',
  'api.brevo.com',
  'api.sendinblue.com',
  'mandrillapp.com/api',
  'api.mailersend.com',
  'app.loops.so/api',
  'api.instantly.ai',
  'server.smartlead.ai',
  'api.lemlist.com',
  'gmail.googleapis.com/gmail/v1/users/me/messages/send',
];

const JS_MAIL_SDKS = [
  'resend',
  'nodemailer',
  '@sendgrid/mail',
  '@sendgrid/client',
  'postmark',
  'mailgun.js',
  'mailgun-js',
  '@aws-sdk/client-ses',
  '@aws-sdk/client-sesv2',
  '@getbrevo/brevo',
  '@mailchimp/mailchimp_transactional',
  'mailersend',
  'loops',
  'emailjs',
];

/**
 * Sites that name a mail host without calling it. Each needs a reason; the
 * guard skips only that (file, rule).
 */
export const MAIL_ALLOW = [
  {
    path: 'apps/web/lib/security/content-security-policy.ts',
    rule: 'mail-host',
    reason:
      'CSP connect-src entry for the Instantly pixel; a browser policy string, not a send.',
  },
];

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function mailHosts(registry) {
  const hosts = new Set(KNOWN_MAIL_HOSTS);
  for (const provider of Object.values(registry?.providers ?? {}))
    for (const host of provider.hosts ?? []) hosts.add(host);
  return [...hosts].sort();
}

/**
 * Finds `name(` calls and returns [index, argument text] for each, with the
 * argument cut at the matching close paren (strings and template literals
 * are skipped so a paren inside them does not end the call).
 */
export function callArguments(text, name) {
  const out = [];
  const pattern = new RegExp(`(?<![\\w$])${escape(name)}\\s*\\(`, 'g');
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    let quote = null;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '(' || ch === '{' || ch === '[') depth += 1;
      else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
      i += 1;
    }
    out.push([match.index, text.slice(start, i - 1)]);
  }
  return out;
}

/** Only judge object literals we can read; spreads and variables pass. */
function literalWithout(arg, key) {
  const trimmed = arg.trim();
  if (!trimmed.startsWith('{')) return false;
  if (/\.\.\.\s*[\w$]/.test(trimmed)) return false;
  return !new RegExp(`(?:^|[\\s,{])${key}\\s*[:,}]`).test(trimmed);
}

function emailNotification(arg) {
  const trimmed = arg.trim();
  if (!trimmed.startsWith('{')) return false;
  const channels = /\bchannels\s*:\s*\[([^\]]*)\]/.exec(trimmed);
  return channels ? /['"`]email['"`]/.test(channels[1]) : true;
}

export function buildMailRules(registry) {
  const hosts = mailHosts(registry).map(escape).join('|');
  const sdks = JS_MAIL_SDKS.map(escape).join('|');
  return [
    {
      id: 'mail-sdk',
      applies: path => CODE.test(path),
      pattern: new RegExp(
        `(?:from\\s+|require\\(\\s*|import\\(\\s*)['"](?:${sdks})['"]|\\bnew\\s+Resend\\s*\\(`,
        'g'
      ),
      fix: 'send through sendStreamEmail (apps/web/lib/email/gateway) on a registered stream',
    },
    {
      id: 'mail-sdk',
      applies: path => PY.test(path),
      pattern:
        /^\s*(?:import|from)\s+(?:smtplib|resend|sendgrid|postmarker|mailgun)\b/gm,
      fix: 'Python never sends mail; call the app gateway through an internal route',
    },
    {
      id: 'mail-host',
      applies: path =>
        CODE.test(path) || PY.test(path) || SHELL.test(path) || YAML.test(path),
      pattern: new RegExp(`(?:https?://|['"\`])(?:${hosts})`, 'g'),
      fix: 'mail provider APIs are called only by the send gateway transport',
    },
    {
      id: 'smtp',
      applies: path =>
        CODE.test(path) || PY.test(path) || SHELL.test(path) || YAML.test(path),
      pattern:
        /['"`]smtps?:\/\/|['"`]smtp\.[a-z0-9-]+\.[a-z]{2,}|\bcreateTransport\s*\(|\bsmtplib\.SMTP(?:_SSL)?\s*\(/g,
      fix: 'no SMTP: send through the gateway so the stream registry applies',
    },
    {
      id: 'hardcoded-from',
      applies: path => CODE.test(path),
      pattern:
        /\b(?:from|[a-z_]*from_?(?:email|address)|sender_?(?:email|address))\s*[:=]\s*(?:[^;\n]*?\|\|\s*|[^;\n]*?\?\?\s*)?['"`][^'"`\n]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi,
      fix: 'sender addresses come from apps/web/lib/email/stream-registry.json; pass fromName at most',
    },
    {
      id: 'send-without-stream',
      applies: path => CODE.test(path),
      match(text) {
        const hits = [];
        for (const name of ['sendEmail', 'sendStreamEmail'])
          for (const [index, arg] of callArguments(text, name))
            if (literalWithout(arg, 'stream')) hits.push(index);
        for (const [index, arg] of callArguments(text, 'sendNotification'))
          if (emailNotification(arg) && literalWithout(arg, 'emailRoute'))
            hits.push(index);
        return hits.sort((a, b) => a - b);
      },
      fix: 'declare the stream (and purpose and consent) on every email; sendNotification email needs emailRoute',
    },
  ];
}

export function mailInScope(path) {
  return (
    SCANNED.test(path) &&
    !NOT_SOURCE.test(path) &&
    !GATEWAY.some(re => re.test(path))
  );
}

export function scanMailSource(path, text, rules) {
  const hits = {};
  for (const rule of rules) {
    if (!rule.applies(path)) continue;
    const indexes = rule.match
      ? rule.match(text)
      : [...text.matchAll(rule.pattern)].map(m => m.index);
    for (const index of indexes) {
      const line = text.slice(0, index).split('\n').length;
      const row = (hits[rule.id] ??= { count: 0, lines: [], fix: rule.fix });
      row.count += 1;
      if (row.lines.length < 3) row.lines.push(line);
    }
  }
  return hits;
}

export function scanMailRepo(repoRoot, rules, files) {
  const found = {};
  for (const path of files) {
    if (!mailInScope(path)) continue;
    let text;
    try {
      text = readFileSync(join(repoRoot, path), 'utf8');
    } catch {
      continue;
    }
    const hits = scanMailSource(path, text, rules);
    for (const allow of MAIL_ALLOW)
      if (allow.path === path) delete hits[allow.rule];
    if (Object.keys(hits).length) found[path] = hits;
  }
  return found;
}

export function loadStreamRegistry(repoRoot) {
  try {
    return JSON.parse(
      readFileSync(join(repoRoot, STREAM_REGISTRY_PATH), 'utf8')
    );
  } catch {
    return null;
  }
}

/**
 * Registry invariants the guard enforces even if nobody sends: cold never on
 * the core domain or a provider that does not permit it.
 */
export function checkRegistry(registry) {
  if (!registry) return [`${STREAM_REGISTRY_PATH}: missing or not JSON`];
  const errors = [];
  const core = registry.coreDomain;
  const isCore = d =>
    typeof d === 'string' && (d === core || d.endsWith(`.${core}`));
  for (const [name, stream] of Object.entries(registry.streams ?? {})) {
    const provider = stream.provider
      ? registry.providers?.[stream.provider]
      : null;
    if (stream.provider && !provider)
      errors.push(
        `${STREAM_REGISTRY_PATH}: ${name} names unknown provider ${stream.provider}`
      );
    if (provider && !(provider.streams ?? []).includes(name))
      errors.push(
        `${STREAM_REGISTRY_PATH}: provider ${stream.provider} does not permit the ${name} stream`
      );
    const lists = ['List-Unsubscribe', 'List-Unsubscribe-Post'];
    if (
      ['lifecycle', 'broadcast', 'cold'].includes(name) &&
      (!lists.every(h => (stream.requiredHeaders ?? []).includes(h)) ||
        stream.requirePostalAddress !== true)
    )
      errors.push(
        `${STREAM_REGISTRY_PATH}: ${name} must require one-click unsubscribe headers and a postal address`
      );
  }
  const cold = registry.streams?.cold;
  if (!cold)
    errors.push(
      `${STREAM_REGISTRY_PATH}: the cold stream must stay declared (closed)`
    );
  else {
    if (isCore(cold.fromDomain))
      errors.push(
        `${STREAM_REGISTRY_PATH}: cold may never send from ${core} or a subdomain`
      );
    if (cold.provider === 'resend')
      errors.push(
        `${STREAM_REGISTRY_PATH}: cold may never use the Resend transactional account`
      );
  }
  return errors;
}

export function mailFixHint(path, rule, row, ceiling) {
  return `${path}:${row.lines.join(',')} ${rule}: ${row.count} site(s), ${ceiling} grandfathered. Fix: ${row.fix}. Contract: ${CONTRACT}`;
}

/** Per-(file, rule) counts on `ref` for `paths`, or null when unavailable. */
export function mailBaseCountsAt(ref, repoRoot, rules, paths, spawn) {
  if (!ref) return null;
  const wanted = [...new Set(paths)].filter(mailInScope);
  const shown = spawn('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: wanted.map(path => `${ref}:${path}\n`).join(''),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (shown.status !== 0) return null;
  const out = shown.stdout;
  const counts = {};
  let at = 0;
  for (const path of wanted) {
    const eol = out.indexOf(10, at);
    if (eol < 0) return null;
    const header = out.subarray(at, eol).toString('utf8');
    at = eol + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) continue;
    const size = Number(header.split(' ')[2]);
    if (!Number.isFinite(size)) return null;
    const text = out.subarray(at, at + size).toString('utf8');
    at += size + 1;
    for (const [rule, row] of Object.entries(scanMailSource(path, text, rules)))
      (counts[path] ??= {})[rule] = row.count;
  }
  return counts;
}

export function mailBaseRatchetAt(ref, repoRoot, spawn) {
  if (!ref) return null;
  const shown = spawn('git', ['show', `${ref}:${MAIL_RATCHET_PATH}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (shown.status !== 0) return null;
  try {
    return JSON.parse(shown.stdout).entries ?? null;
  } catch {
    return null;
  }
}

/**
 * @returns {string[]} errors. A site may not exceed its grandfathered count
 * (or its count on the base revision); a dropped count must be lowered; the
 * ratchet may not grow past the base revision's.
 */
export function checkMailGuard({
  found,
  ratchet,
  baseRatchet = null,
  baseCounts = null,
}) {
  const errors = [];
  for (const [path, hits] of Object.entries(found)) {
    for (const [rule, row] of Object.entries(hits)) {
      const ceiling = Math.max(
        ratchet[path]?.[rule] ?? 0,
        baseCounts?.[path]?.[rule] ?? 0
      );
      if (row.count > ceiling)
        errors.push(mailFixHint(path, rule, row, ceiling));
    }
  }
  for (const [path, rules] of Object.entries(ratchet)) {
    for (const [rule, count] of Object.entries(rules)) {
      const now = found[path]?.[rule]?.count ?? 0;
      const droppedOnBase =
        baseCounts !== null && (baseCounts[path]?.[rule] ?? 0) < count;
      if (now < count && !droppedOnBase)
        errors.push(
          `${MAIL_RATCHET_PATH}: ${path} ${rule} is ${now}, ratchet says ${count}; lower it (node scripts/external-api-guard.mjs --write)`
        );
      if (baseRatchet && count > (baseRatchet[path]?.[rule] ?? 0))
        errors.push(
          `${MAIL_RATCHET_PATH}: ${path} ${rule} rose to ${count} (base ${baseRatchet[path]?.[rule] ?? 0}); the mail ratchet only shrinks`
        );
    }
  }
  return errors;
}

export function tightenMailRatchet(ratchet, found) {
  const next = {};
  for (const path of Object.keys(ratchet).sort()) {
    for (const rule of Object.keys(ratchet[path]).sort()) {
      const now = Math.min(
        ratchet[path][rule],
        found[path]?.[rule]?.count ?? 0
      );
      if (now > 0) (next[path] ??= {})[rule] = now;
    }
  }
  return next;
}
