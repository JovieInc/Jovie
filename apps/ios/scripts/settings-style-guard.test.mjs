import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const settingsPath = path.join(
  repoRoot,
  'apps/ios/Jovie/Features/Settings/SettingsView.swift'
);
const themePath = path.join(
  repoRoot,
  'apps/ios/Jovie/DesignSystem/JovieTheme.swift'
);

test('iOS Settings uses native links, LabeledContent, and Liquid Glass', () => {
  const source = readFileSync(settingsPath, 'utf8');
  const theme = readFileSync(themePath, 'utf8');

  assert.match(source, /Link\(destination:/);
  assert.match(source, /LabeledContent/);
  assert.match(source, /\.jovieSurface\(radius: JovieRadius\.medium/);
  assert.match(source, /JoviePressFeedbackButtonStyle\(\)/);
  assert.match(source, /SettingsLayout\.reservedActionMinHeight/);
  assert.doesNotMatch(source, /\.textCase\(\.uppercase\)/);
  assert.doesNotMatch(source, /SettingsRowButtonStyle/);
  assert.doesNotMatch(source, /JovieColor\.surface0, in: RoundedRectangle/);
  assert.doesNotMatch(source, /URL\(string: "https:\/\/jov\.ie\/support"\)!/);

  assert.match(theme, /glassEffect\(/);
  assert.match(theme, /func jovieSurface\(/);
});
