import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const tableActionMenuSource = path.join(
  webRoot,
  'components/atoms/table-action-menu/TableActionMenu.tsx'
);

const rawTriggerChromePatterns = [
  /rounded-\[[^\]]+\]/,
  /bg-\[[^\]]+\]/,
  /--linear-/,
  /duration-150/,
  /color-mix\(/i,
];

function readDefaultTriggerSource() {
  const source = readFileSync(tableActionMenuSource, 'utf8');
  const triggerSource = source.match(
    /const DEFAULT_TRIGGER_CLASS_NAME = \[[\s\S]*?\]\.join\(' '\);/
  )?.[0];

  expect(triggerSource).toBeDefined();
  expect(source).toContain('triggerClassName={DEFAULT_TRIGGER_CLASS_NAME}');

  return triggerSource ?? '';
}

describe('TableActionMenu System B style guard', () => {
  it('keeps the default trigger chrome on semantic System B utilities', () => {
    const triggerSource = readDefaultTriggerSource();
    const offenders = rawTriggerChromePatterns
      .filter(pattern => pattern.test(triggerSource))
      .map(pattern => pattern.toString());

    expect(
      offenders,
      `TableActionMenu default trigger leaked raw chrome: ${offenders.join(', ')}`
    ).toEqual([]);
    expect(triggerSource).toContain('h-7 w-7');
    expect(triggerSource).toContain('rounded-full');
    expect(triggerSource).toContain('bg-transparent');
    expect(triggerSource).toContain('text-tertiary-token');
    expect(triggerSource).toContain('duration-fast');
    expect(triggerSource).toContain('ease-interactive');
    expect(triggerSource).toContain('hover:bg-surface-1');
    expect(triggerSource).toContain('hover:text-primary-token');
    expect(triggerSource).toContain('focus-visible:bg-surface-1');
    expect(triggerSource).toContain('focus-visible:ring-focus/50');
  });
});
