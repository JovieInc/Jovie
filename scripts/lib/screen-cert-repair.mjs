/**
 * Deterministic screen-certificate repair.
 *
 * Safe edits only: waive submit-event false positives, rename empty-list
 * stories, and generate provable state stories and axe tests. Missing states
 * or unapproved controls fall through to the model without writing files.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unsortedPathErrors } from './component-cert-screens.mjs';
import {
  applicableStates,
  certifyComponent,
  statesCovered,
} from './component-certificate.mjs';

const MARKER = '// screen-cert-repair: generated';
const WAIVERS = 'docs/design-system/component-certification.json';
const LENGTH_SUFFIX = ' and the rest of the confirmed catalog phrase';
const ARABIC_MESSAGE = 'اختر عبارة مؤكدة من الكتالوج قبل أن تنشئ أي عمل فني.';
const ARABIC_SHORT = 'أفق النيون';
const ERROR_BASE =
  'It never draws its own failure. The only submit signal is the jovie-chat-submit-prompt event it dispatches, and the chat that receives it owns the request and its errors.';
const ERROR_NULL =
  ' A failed tool event returns null so the shared failure card draws it.';
const ERROR_TAIL = ' The detector matched submit in that event name.';
const OFFLINE_REASON =
  'It never fetches. The only submit signal is the jovie-chat-submit-prompt event it dispatches, and the chat composer owns the request and its network error. The detector matched submit in that event name.';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function matchDelim(text, open, a, b) {
  let depth = 0;
  let inStr = false;
  let quote = '';
  let esc = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = true;
      quote = c;
    } else if (c === a) depth += 1;
    else if (c === b) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced delimiter');
}

/** True when every mutate hit is the token submit inside chat-submit-prompt. */
export function submitEventOnly(source) {
  const hits = [
    ...source.matchAll(
      /\b(fetch\(|mutate|useMutation|onSubmit|submit|action=|startTransition|useActionState)\b/g
    ),
  ];
  if (!hits.length || hits.some(hit => hit[0] !== 'submit')) return false;
  return hits.every(hit =>
    source
      .slice(Math.max(0, hit.index - 40), hit.index + 20)
      .includes('chat-submit-prompt')
  );
}

export function renameEmptyExports(source, blocked = new Set()) {
  return source.replace(
    /export const (Without|No)([A-Z]\w*)\b/g,
    (full, _prefix, rest, offset) => {
      const next = source.slice(offset);
      const end = next.search(/\nexport const /);
      const body = end === -1 ? next : next.slice(0, end);
      const name = `Empty${rest}`;
      if (
        !/: \[\]/.test(body) ||
        blocked.has(`Without${rest}`) ||
        blocked.has(`No${rest}`)
      )
        return full;
      if (source.includes(`export const ${name}`)) return full;
      return `export const ${name}`;
    }
  );
}

function waiverReasons(source, applicable) {
  if (!submitEventOnly(source)) return {};
  const reasons = {};
  const errorish = /\b(error|isError|onError|errorMessage|catch)\b/.test(
    source
  );
  if (applicable.error && !errorish) {
    const failedNull =
      source.includes("=== 'failed'") && source.includes('return null');
    reasons.error = `${ERROR_BASE}${failedNull ? ERROR_NULL : ''}${ERROR_TAIL}`;
  }
  if (applicable.offline && !applicable.loading && !source.includes('fetch('))
    reasons.offline = OFFLINE_REASON;
  return reasons;
}

function componentBlocks(body) {
  const blocks = [];
  const re = /^    "([^"]+)": \{$/gm;
  for (const match of body.matchAll(re)) {
    const open = match.index + match[0].length - 1;
    const close = matchDelim(body, open, '{', '}');
    blocks.push({ key: match[1], start: match.index, open, close });
  }
  return blocks;
}

function renderStates(entries) {
  return entries
    .map(([key, value], index) => {
      const comma = index === entries.length - 1 ? '' : ',';
      return `      ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`;
    })
    .join('\n');
}

function renderBlock(path, entries, trailingComma) {
  return `    ${JSON.stringify(path)}: {\n${renderStates(entries)}\n    }${trailingComma ? ',' : ''}`;
}

/** Insert waiver reasons in path order. An existing different reason stays. */
export function insertWaiverBlock(text, componentPath, reasons) {
  const wanted = Object.entries(reasons);
  if (!wanted.length) return text;
  const start = text.indexOf('\n  "waivers": {');
  if (start < 0) throw new Error('waivers object missing');
  const open = text.indexOf('{', start);
  const close = matchDelim(text, open, '{', '}');
  const body = text.slice(open + 1, close);
  const blocks = componentBlocks(body);
  const existing = blocks.find(block => block.key === componentPath);
  let nextBody = body;
  if (existing) {
    const inner = body.slice(existing.open + 1, existing.close);
    const current = [...inner.matchAll(/^      "([^"]+)": (".*")/gm)].map(
      match => [match[1], JSON.parse(match[2])]
    );
    let changed = false;
    for (const [state, reason] of wanted) {
      if (current.some(([key]) => key === state)) continue;
      current.push([state, reason]);
      changed = true;
    }
    if (!changed) return text;
    current.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const block = renderBlock(
      componentPath,
      current,
      body[existing.close + 1] === ','
    );
    nextBody =
      body.slice(0, existing.start) +
      block +
      body.slice(
        existing.close + 1 + (body[existing.close + 1] === ',' ? 1 : 0)
      );
  } else {
    const after = blocks.find(block => block.key > componentPath);
    const entries = [...wanted].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    if (after) {
      const block = `${renderBlock(componentPath, entries, true)}\n`;
      nextBody = body.slice(0, after.start) + block + body.slice(after.start);
    } else {
      const last = blocks.at(-1);
      let prefix = body;
      if (last && body[last.close + 1] !== ',')
        prefix = `${body.slice(0, last.close + 1)},${body.slice(last.close + 1)}`;
      nextBody = `${prefix}${prefix.endsWith('\n') ? '' : '\n'}${renderBlock(componentPath, entries, false)}\n`;
    }
  }
  const next = text.slice(0, open + 1) + nextBody + text.slice(close);
  const parsed = JSON.parse(next);
  const order = unsortedPathErrors('waivers', parsed.waivers);
  if (order.length) throw new Error(order.join('\n'));
  return next;
}

function extractArgs(storySource) {
  const at = storySource.search(/\bargs:\s*\{/);
  if (at < 0) return null;
  const open = storySource.indexOf('{', at);
  return storySource.slice(open, matchDelim(storySource, open, '{', '}') + 1);
}

function mapStrings(objectSource, fn) {
  return objectSource.replace(
    /'([^'\\]*)'|"([^"\\]*)"/g,
    (full, single, double) => {
      const body = single ?? double;
      const next = fn(body);
      if (next === body) return full;
      const quote = full[0];
      const escaped = next
        .replaceAll('\\', '\\\\')
        .replaceAll(quote, `\\${quote}`);
      return `${quote}${escaped}${quote}`;
    }
  );
}

function lengthen(body) {
  if (!body.includes(' ') || body.length < 8 || body.endsWith(LENGTH_SUFFIX))
    return body;
  return body + LENGTH_SUFFIX;
}

function toRtl(body) {
  if (!body.includes(' ')) return body;
  return body.length > 40 ? ARABIC_MESSAGE : ARABIC_SHORT;
}

function findPartialTarget(source) {
  const re = /export function (\w+)\(props:\s*\{([^}]*)\}\)/g;
  for (const match of source.matchAll(re)) {
    const [, name, props] = match;
    const optional = [...props.matchAll(/(\w+)\?:/g)].map(hit => hit[1]);
    const required = [...props.matchAll(/(\w+):/g)].map(hit => hit[1]);
    if (!optional.length || required.length) continue;
    const close = matchDelim(
      source,
      source.indexOf('{', match.index + match[0].length - 1),
      '{',
      '}'
    );
    const body = source.slice(match.index, close);
    const shown = optional.find(prop =>
      new RegExp(`props\\.${prop}\\s*\\?`).test(body)
    );
    if (!shown) continue;
    const used = [...source.matchAll(/export const ([A-Z0-9_]+) =/g)]
      .map(hit => hit[1])
      .filter(constName => body.includes(constName));
    return { name, prop: shown, titleConst: used[0] ?? null };
  }
  return null;
}

function storyMeta(storySource) {
  const title = storySource.match(/title:\s*'([^']+)'/)?.[1];
  const component = storySource.match(/component:\s*([A-Za-z0-9_]+)/)?.[1];
  const from = storySource.match(/from '(\.\/[^']+)'/)?.[1];
  if (!title || !component || !from) return null;
  return { title, component, from };
}

function mocksFrom(testSource) {
  if (!testSource?.includes('vi.mock(')) return '';
  const chunks = [];
  const hoisted =
    testSource.match(/const \w+ = vi\.hoisted\(\(\) => vi\.fn\(\)\);/g) ?? [];
  chunks.push(...hoisted);
  for (const match of testSource.matchAll(/vi\.mock\(/g)) {
    const open = match.index + 'vi.mock'.length;
    chunks.push(
      testSource.slice(
        match.index,
        matchDelim(testSource, open, '(', ')') + 1
      ) + ';'
    );
  }
  return chunks.join('\n\n');
}

function generatedStates(meta, partial, args) {
  const names = [meta.component];
  if (partial && partial.name !== meta.component) names.push(partial.name);
  const imports =
    names.length === 1
      ? `import { ${names[0]} } from '${meta.from}';`
      : `import {\n  ${names.join(',\n  ')},\n} from '${meta.from}';`;
  const longArgs = mapStrings(args, lengthen);
  const rtlArgs = mapStrings(args, toRtl);
  const partialStory = partial
    ? `export const PartialOptional${partial.prop[0].toUpperCase()}${partial.prop.slice(1)}: StoryObj<typeof meta> = {\n  args: ${args},\n  render: () => <${partial.name} />,\n};\n\n`
    : '';
  return `${MARKER}\nimport type { Meta, StoryObj } from '@storybook/nextjs-vite';\n${imports}\n\nconst meta = {\n  title: '${meta.title}/States',\n  component: ${meta.component},\n  parameters: { layout: 'centered' },\n} satisfies Meta<typeof ${meta.component}>;\n\nexport default meta;\n\n${partialStory}export const LongContent: StoryObj<typeof meta> = {\n  args: ${longArgs},\n};\n\nexport const RtlArabicPhrase: StoryObj<typeof meta> = {\n  args: ${rtlArgs},\n  decorators: [\n    Story => (\n      <div dir='rtl' lang='ar'>\n        <Story />\n      </div>\n    ),\n  ],\n};\n`;
}

function stringField(objectSource, field) {
  return objectSource.match(new RegExp(`${field}:\\s*'([^']*)'`))?.[1] ?? null;
}

function generatedTest(meta, partial, args, emptyMessage, mocks) {
  const longMessage = lengthen(stringField(args, 'message') ?? '');
  const titleImport = partial?.titleConst ? `, ${partial.titleConst}` : '';
  const partialImport =
    partial && partial.name !== meta.component ? `, ${partial.name}` : '';
  const partialAssert = partial?.titleConst
    ? `expect(screen.getByText(${partial.titleConst})).toBeVisible();\n    expect(screen.queryByText(${JSON.stringify(stringField(args, 'message') ?? '')})).toBeNull();`
    : 'expect(screen.queryByText(' +
      JSON.stringify(stringField(args, 'message') ?? '') +
      ')).toBeNull();';
  const viImport = mocks ? ', vi' : '';
  return `${MARKER}\nimport { render, screen } from '@testing-library/react';\nimport { describe, expect, it${viImport} } from 'vitest';\nimport { expectNoA11yViolations } from '@/tests/utils/a11y';\nimport { ${meta.component}${partialImport}${titleImport} } from '${meta.from}';\n\n${mocks ? `${mocks}\n\n` : ''}describe('${meta.component} screen certificate', () => {\n  it('shows the empty message', async () => {\n    const { container } = render(\n      <${meta.component} message=${JSON.stringify(emptyMessage)} candidates={[]} />\n    );\n    expect(screen.getByText(${JSON.stringify(emptyMessage)})).toBeVisible();\n    await expectNoA11yViolations(container);\n  });\n\n  it('shows a partial card without the optional message', async () => {\n    const { container } = render(<${partial?.name ?? meta.component} />);\n    ${partialAssert}\n    await expectNoA11yViolations(container);\n  });\n\n  it('shows a long catalog phrase', async () => {\n    const { container } = render(\n      <${meta.component} message=${JSON.stringify(longMessage)} candidates={[]} />\n    );\n    expect(screen.getByText(${JSON.stringify(longMessage)})).toBeVisible();\n    await expectNoA11yViolations(container);\n  });\n\n  it('shows an Arabic phrase in an RTL transcript', async () => {\n    const { container } = render(\n      <div dir='rtl' lang='ar'>\n        <${meta.component} message=${JSON.stringify(ARABIC_MESSAGE)} candidates={[]} />\n      </div>\n    );\n    expect(screen.getByText(${JSON.stringify(ARABIC_MESSAGE)})).toBeVisible();\n    await expectNoA11yViolations(container);\n  });\n});\n`;
}

function referenced(dir, name, owner) {
  if (!existsSync(dir)) return false;
  const needle = new RegExp(`\\b${name}\\b`);
  return readdirSync(dir).some(file => {
    if (!/\.(tsx?|jsx?|mjs)$/.test(file)) return false;
    const path = join(dir, file);
    return path !== owner && needle.test(readFileSync(path, 'utf8'));
  });
}

function repairOne(root, rel, waiverText) {
  const abs = join(root, rel);
  const source = readFileSync(abs, 'utf8');
  const dir = dirname(abs);
  const base = rel.slice(rel.lastIndexOf('/') + 1, -'.tsx'.length);
  const storyPath = join(dir, `${base}.stories.tsx`);
  const storySource = existsSync(storyPath)
    ? readFileSync(storyPath, 'utf8')
    : '';
  const oldName = storySource.match(
    /export const ((?:Without|No)[A-Z]\w*)\b/
  )?.[1];
  const blocked = new Set();
  if (oldName && referenced(dir, oldName, storyPath)) blocked.add(oldName);
  const renamed = renameEmptyExports(storySource, blocked);
  const statesPath = join(dir, `${base}.states.stories.tsx`);
  const testPath = join(dir, `${base}.certificate.test.tsx`);
  const primaryTest = join(dir, `${base}.test.tsx`);
  let statesText = existsSync(statesPath)
    ? readFileSync(statesPath, 'utf8')
    : '';
  let testText = existsSync(testPath) ? readFileSync(testPath, 'utf8') : '';
  const applicable = applicableStates(source, rel);
  const waivers = JSON.parse(waiverText).waivers?.[rel] ?? {};
  const reasons = waiverReasons(source, applicable);
  const toWaive = Object.fromEntries(
    Object.entries(reasons).filter(([state]) => !waivers[state])
  );
  let nextWaivers = waiverText;
  if (Object.keys(toWaive).length)
    nextWaivers = insertWaiverBlock(waiverText, rel, toWaive);
  const meta = storyMeta(renamed);
  const args = meta ? extractArgs(renamed) : null;
  const partial = findPartialTarget(source);
  const coveredNow = statesCovered(`${renamed}\n${statesText}`);
  const needStates =
    meta &&
    args &&
    ['partial', 'long-content', 'rtl-overflow'].some(
      state =>
        applicable[state] &&
        !coveredNow[state] &&
        !waivers[state] &&
        !toWaive[state]
    );
  if (needStates) {
    if (statesText && !statesText.includes(MARKER))
      return { ok: false, missing: ['states-file-owned'] };
    statesText = generatedStates(meta, partial, args);
  }
  const axe = /expectNoA11yViolations|\baxe\(|vitest-axe|toHaveNoViolations/;
  const tests = `${existsSync(primaryTest) ? readFileSync(primaryTest, 'utf8') : ''}\n${testText}`;
  if (!axe.test(tests) && meta && args) {
    if (testText && !testText.includes(MARKER))
      return { ok: false, missing: ['test-file-owned'] };
    const emptyAt = renamed.search(/export const Empty\w*/);
    const emptyMessage =
      stringField(
        extractArgs(emptyAt < 0 ? renamed : renamed.slice(emptyAt)) ?? '',
        'message'
      ) ?? stringField(args, 'message');
    testText = generatedTest(
      meta,
      partial,
      args,
      emptyMessage,
      mocksFrom(
        existsSync(primaryTest) ? readFileSync(primaryTest, 'utf8') : ''
      )
    );
  }
  const storyJoined = [renamed, statesText].filter(Boolean).join('\n');
  const testJoined = [
    existsSync(primaryTest) ? readFileSync(primaryTest, 'utf8') : '',
    testText,
  ]
    .filter(Boolean)
    .join('\n');
  const appliedWaivers = JSON.parse(nextWaivers).waivers?.[rel] ?? {};
  const certificate = certifyComponent({
    path: rel,
    source,
    storySource: storyJoined,
    testSource: testJoined,
    waivers: appliedWaivers,
  });
  const states =
    /** @type {{ status?: string, states?: Record<string, { status?: string }> } | undefined} */ (
      certificate.criteria.find(item => item.id === 'states')
    );
  const a11y = /** @type {{ status?: string } | undefined} */ (
    certificate.criteria.find(item => item.id === 'a11y')
  );
  const owner = certificate.criteria.find(item => item.id === 'ds-owner');
  const scope = join(
    root,
    'apps/web/tests/unit/design-system/plain-button-scope.json'
  );
  const ownerPassed =
    owner?.status === 'pass' &&
    (!/\bPlainButton\b/.test(source) ||
      (existsSync(scope) &&
        JSON.parse(readFileSync(scope, 'utf8')).files.includes(
          rel.replace(/^apps\/web\//, '')
        )));
  if (states?.status !== 'pass' || a11y?.status !== 'pass' || !ownerPassed)
    return {
      ok: false,
      missing: Object.entries(states?.states ?? {})
        .filter(([, row]) => row.status === 'fail')
        .map(([name]) => name)
        .concat(a11y?.status === 'pass' ? [] : ['a11y'])
        .concat(ownerPassed ? [] : ['ds-owner']),
    };
  const files = [];
  if (renamed !== storySource) files.push([storyPath, renamed]);
  if (
    statesText &&
    statesText !==
      (existsSync(statesPath) ? readFileSync(statesPath, 'utf8') : '')
  )
    files.push([statesPath, statesText]);
  if (
    testText &&
    testText !== (existsSync(testPath) ? readFileSync(testPath, 'utf8') : '')
  )
    files.push([testPath, testText]);
  return { ok: true, files, waiverText: nextWaivers };
}

export function applyRepair(root, componentPaths, { write = false } = {}) {
  const waiverPath = join(root, WAIVERS);
  let waiverText = readFileSync(waiverPath, 'utf8');
  const changed = [];
  const writes = [];
  for (const rel of componentPaths) {
    const result = repairOne(root, rel, waiverText);
    if (!result.ok)
      return { ok: false, component: rel, missing: result.missing, changed };
    if (result.waiverText !== waiverText) {
      waiverText = result.waiverText;
      writes.push([waiverPath, waiverText]);
      changed.push(WAIVERS);
    }
    for (const [path, text] of result.files) {
      writes.push([path, text]);
      changed.push(relative(root, path));
    }
  }
  if (write) for (const [path, text] of writes) writeFileSync(path, text);
  return { ok: true, changed: [...new Set(changed)] };
}

function parseArgs(argv) {
  const components = [];
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') write = true;
    else if (argv[i] === '--component') components.push(argv[++i]);
  }
  return { write, components };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { write, components } = parseArgs(process.argv.slice(2));
  if (!components.length) {
    console.error(
      'usage: screen-cert-repair.mjs --write --component <path.tsx>'
    );
    process.exit(1);
  }
  const result = applyRepair(repoRoot, components, { write });
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
