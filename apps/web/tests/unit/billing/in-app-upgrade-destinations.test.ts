import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../../..');
// Public navigation, paid-plan comparison, and the existing flag-off fallback.
// Free-tier upgrade actions must use UpgradeButton instead of this destination.
const comparisons = new Map([
  ['components/molecules/UpgradeButton.tsx', 1],
  // Max-only settings must not purchase the lower Artist Presence plan.
  ['components/molecules/settings/SettingsPlanGateLabel.tsx', 1],
  // Existing billing-portal failure recovery, not a free-plan upgrade CTA.
  ['components/organisms/useUserMenuActions.ts', 1],
  ['components/jovie/components/ChatUsageAlert.tsx', 2],
  ['components/features/dashboard/organisms/SettingsUsageStatsSection.tsx', 1],
  ['components/organisms/user-button/UsageMenuItem.tsx', 1],
  ['components/organisms/VoicePageContent.tsx', 1],
  ['components/organisms/footer-module/Footer.tsx', 1],
]);

function pricingReferences(source: string): number {
  // Parse only candidate files; most of the component tree has no billing route.
  if (!source.includes('PRICING') && !source.includes('pricing')) return 0;
  const file = ts.createSourceFile(
    'component.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let count = 0;
  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAccessExpression(node) && node.name.text === 'PRICING') ||
      (ts.isStringLiteralLike(node) && /^\/pricing(?:[/?#]|$)/.test(node.text))
    )
      count++;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) &&
      !/\.(test|spec|stories)\./.test(entry.name)
      ? [path]
      : [];
  });
}

describe('in-app upgrade destination boundary', () => {
  it('detects route constants, aliases and literal pricing destinations, not comments or copy', () => {
    expect(
      pricingReferences(
        'const destination = APP_ROUTES.PRICING; <Link href={destination}>Upgrade</Link>'
      )
    ).toBe(1);
    expect(
      pricingReferences('<Link href="/pricing?source=upload">Upgrade</Link>')
    ).toBe(1);
    expect(
      pricingReferences('// APP_ROUTES.PRICING\nconst label = "Pricing";')
    ).toBe(0);
  });

  it('has no stray pricing destinations in in-app control families', () => {
    const roots = [
      'atoms',
      'molecules',
      'organisms',
      'jovie',
      'features/dashboard',
    ];
    const violations = roots
      .flatMap(root => sourceFiles(resolve(webRoot, 'components', root)))
      .flatMap(path => {
        const name = relative(webRoot, path);
        const count = pricingReferences(readFileSync(path, 'utf8'));
        return count > (comparisons.get(name) ?? 0)
          ? [`${name}: ${count} pricing destinations`]
          : [];
      });
    expect(violations).toEqual([]);
  });
});
