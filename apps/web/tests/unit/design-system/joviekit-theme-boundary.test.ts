import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * JOV-6750 — the canonical JovieTheme is owned by the local JovieKit package
 * and consumed through it by both Xcode targets. No duplicated shared theme
 * file may reappear in either target: a second compile entry is a parallel
 * token family in the making (JOV-INV-015).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const PACKAGE_THEME =
  'apps/ios/Packages/JovieKit/Sources/JovieKit/JovieTheme.swift';
const APP_THEME = 'apps/ios/Jovie/DesignSystem/JovieTheme.swift';

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

describe('Shared JovieKit theme boundary (JOV-6750)', () => {
  it('owns JovieTheme.swift inside the local package', () => {
    expect(existsSync(join(REPO_ROOT, PACKAGE_THEME))).toBe(true);
  });

  it('keeps no duplicated theme file in the iOS app tree', () => {
    expect(existsSync(join(REPO_ROOT, APP_THEME))).toBe(false);
  });

  it('does not compile the theme directly in either Xcode target', () => {
    for (const project of [
      'apps/ios/Jovie.xcodeproj/project.pbxproj',
      'apps/ios/JovieMac.xcodeproj/project.pbxproj',
    ]) {
      const pbxproj = readRepo(project);
      expect(pbxproj, project).not.toContain('JovieTheme.swift');
    }
  });

  it('links the JovieKit package product in both Xcode targets', () => {
    for (const project of [
      'apps/ios/Jovie.xcodeproj/project.pbxproj',
      'apps/ios/JovieMac.xcodeproj/project.pbxproj',
    ]) {
      const pbxproj = readRepo(project);
      expect(pbxproj, project).toMatch(
        /XCLocalSwiftPackageReference "(?:Packages\/)?JovieKit"/
      );
      expect(pbxproj, project).toContain('JovieKit in Frameworks');
    }
  });

  it('declares the shared theme surface public at the module boundary', () => {
    const source = readRepo(PACKAGE_THEME);
    expect(source).toMatch(/public enum JovieColor/);
    expect(source).toMatch(/public enum JovieFont/);
    expect(source).toMatch(/public struct JoviePillButtonStyle/);
    expect(source).toMatch(/public struct JovieIconButtonStyle/);
    expect(source).toMatch(/public struct JoviePressFeedbackButtonStyle/);
    expect(source).toMatch(/public func jovieSurface\(/);
    expect(source).toMatch(/public init\(hex: UInt32\)/);
  });

  it('keeps the native button-style ownership bound to the package source', () => {
    const registry = readRepo(
      'apps/web/data/designSystem/uiOwnershipRegistry.ts'
    );
    expect(registry).toContain('sourcePath: nativeButtonStyleSource');
    expect(registry).toContain(PACKAGE_THEME);
    expect(registry).not.toContain(APP_THEME);
  });
});
