import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * JOV-5317 — locked CTA label weight is medium (510).
 * Weight is the only allowed delta from live chrome. Do not drop to 400/book.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function ruleBlock(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(
    new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`)
  );
  expect(match, `missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('CTA label weight lock (JOV-5317)', () => {
  it('keeps --font-weight-medium at 510 and not a second step down', () => {
    const tokens = readRepo('apps/web/styles/design-system.css');

    expect(tokens).toMatch(/--font-weight-medium:\s*510;/);
    expect(tokens).toMatch(/--font-weight-book:\s*450;/);
    expect(tokens).toMatch(/--font-weight-semibold:\s*590;/);
    expect(tokens).not.toMatch(/--font-weight-medium:\s*(?:400|450|590);/);
  });

  it('keeps the shared web button on the medium token, not semibold or book', () => {
    const source = readRepo('packages/ui/atoms/button.tsx');

    expect(source).toContain('[font-weight:var(--font-weight-medium)]');
    expect(source).not.toMatch(/\bfont-(?:semibold|bold|book)\b/);
    expect(source).not.toMatch(/font-\[(?:400|450|590|600|650)\]/);
  });

  it('keeps public and marketing CTA labels on medium without changing chrome', () => {
    const globals = readRepo('apps/web/app/globals.css');
    const header = readRepo('apps/web/components/organisms/HeaderNav.css');

    const marketingCta = ruleBlock(globals, '.marketing-cta');
    const primary = ruleBlock(globals, '.public-action-primary');
    const secondary = ruleBlock(globals, '.public-action-secondary');
    const headerCta = ruleBlock(header, '.marketing-glass-header__cta');

    for (const block of [marketingCta, primary, secondary, headerCta]) {
      expect(block).toMatch(/font-weight:\s*var\(--font-weight-medium\)/);
      expect(block).not.toMatch(/font-weight:\s*(?:400|450|590|600|620|650)/);
      expect(block).not.toMatch(/\bfont-semibold\b/);
    }

    expect(primary).toContain('font-size: 14px');
    expect(primary).toContain('min-height: 42px');
    expect(primary).toContain('border-radius: 999px');
    expect(primary).toContain('letter-spacing: 0');
    expect(headerCta).toContain('min-height: 2rem');
    expect(headerCta).toContain('font-size: 0.79rem');
    expect(headerCta).toContain('letter-spacing: 0');
  });

  it('keeps the shared iOS ActionButton label at 510, not 400 or 590', () => {
    const source = readRepo('apps/ios/Jovie/DesignSystem/JovieTheme.swift');

    expect(source).toMatch(/static let actionLabelWeight: CGFloat = 510/);
    expect(source).toContain(
      'static let labelWeight = JovieFont.actionLabelWeight'
    );
    expect(source).toContain(
      'JovieFont.body(size: 14, numericWeight: JovieActionButtonMetrics.labelWeight)'
    );
    expect(source).not.toMatch(
      /static let actionLabelWeight: CGFloat = (?:400|450|590|600)/
    );
  });
});
