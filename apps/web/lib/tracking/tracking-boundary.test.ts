// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const web = process.cwd();
const transports = new Set(
  ['facebook', 'google', 'tiktok'].map(v => `lib/tracking/forwarding/${v}.ts`)
);
const browserAdapters = new Set([
  'components/features/tracking/MetaPixel.tsx',
  'components/features/tracking/EditorialRetargeting.tsx',
  'components/providers/GoogleAnalytics.tsx',
  'components/providers/Analytics.tsx',
]);
const dispatcher = 'lib/tracking/forwarding/dispatch.ts';

function violations(path: string, source: string): string[] {
  const failures: string[] = [];
  const adapter = browserAdapters.has(path);
  const transport = transports.has(path);
  if (
    !adapter &&
    path !== dispatcher &&
    path !== 'lib/analytics.ts' &&
    !/fbq|gtag|forwardTo|forwarding\/|facebook\.net|google-analytics\.com|tiktok\.com|graph\.facebook\.com/.test(
      source
    )
  )
    return [];
  const syntax = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node)) {
      const value = node.text;
      if (value.startsWith('@vercel/analytics') && !adapter)
        failures.push(`${path}: direct analytics SDK`);
      const target = value.startsWith('@/')
        ? value.slice(2)
        : relative(web, resolve(web, path, '..', value));
      if (
        (value.startsWith('.') || value.startsWith('@/')) &&
        transports.has(`${target}.ts`) &&
        path !== dispatcher
      )
        failures.push(`${path}: direct vendor import`);
      if (
        /https:\/\/(?:connect\.facebook\.net|www\.googletagmanager\.com\/gtag|www\.google-analytics\.com\/mp|business-api\.tiktok\.com|graph\.facebook\.com)/.test(
          value
        ) &&
        !adapter &&
        !transport &&
        path !== 'lib/security/content-security-policy.ts'
      )
        failures.push(`${path}: direct vendor endpoint`);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(syntax);
      if (
        /(?:^|\.)(?:fbq|gtag|ensureFbqStub|forwardToFacebook|forwardToGoogle|forwardToTikTok)$/.test(
          callee
        ) &&
        !adapter &&
        !transport &&
        path !== dispatcher &&
        path !== 'lib/tracking/google-consent-mode.ts' &&
        path !== 'lib/analytics.ts'
      )
        failures.push(`${path}: direct vendor call`);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  if (adapter && !source.includes('useTrackingEligibility('))
    failures.push(`${path}: missing policy gate`);
  if (path === dispatcher && !source.includes('trackingEligibility({'))
    failures.push(`${path}: missing policy gate`);
  if (
    path === 'lib/analytics.ts' &&
    !source.includes('getBrowserTrackingEligibility().ga')
  )
    failures.push(`${path}: missing policy gate`);
  return failures;
}
function candidateFiles(): string[] {
  // Native text prefilter keeps this whole-source guard cheap in normal CI.
  // AST validation below owns the rule, including aliased/dynamic imports.
  const paths = execFileSync(
    'rg',
    [
      '-l',
      'fbq|gtag|forwardTo|forwarding/|facebook\\.net|google-analytics\\.com|tiktok\\.com|graph\\.facebook\\.com|@vercel/analytics',
      'app',
      'components',
      'lib',
      '--glob',
      '*.{ts,tsx,js,jsx,mts,mjs}',
      '--glob',
      '!*.{test,spec,stories}.*',
      '--glob',
      '!*.d.ts',
    ],
    { cwd: web, encoding: 'utf8' }
  )
    .trim()
    .split('\n');
  return [
    ...new Set([...paths, ...browserAdapters, dispatcher, 'lib/analytics.ts']),
  ];
}

describe('third-party tracking cannot bypass the central policy', () => {
  it('scans all executable app, component and library paths', () => {
    expect(
      candidateFiles().flatMap(path =>
        violations(path, readFileSync(resolve(web, path), 'utf8'))
      )
    ).toEqual([]);
  });
  it.each([
    "import { forwardToFacebook as send } from '@/lib/tracking/forwarding/facebook'; send(event, config);",
    "window.fbq('track', 'PageView');",
    "fetch('https://www.google-analytics.com/mp/collect');",
    "const forward = await import('@/lib/tracking/forwarding/tiktok'); forward.forwardToTikTok(event, config);",
  ])('negative control: rejects a seeded bypass %s', seeded => {
    expect(
      violations('app/api/seeded-bypass/route.ts', seeded).length
    ).toBeGreaterThan(0);
  });
  it('rejects deleting the gate from an approved adapter', () => {
    expect(
      violations(
        'components/features/tracking/MetaPixel.tsx',
        "fbq('track', 'PageView')"
      )
    ).toContain(
      'components/features/tracking/MetaPixel.tsx: missing policy gate'
    );
  });
});
