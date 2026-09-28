import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAGE_TOOLBAR_CONTAINER_CLASS,
  TABLE_TOOLBAR_SHELL_CLASS,
} from '@/components/organisms/table/molecules/PageToolbar';
import { getSidebarNavRowClassName } from '@/components/shell/SidebarNavItem';
import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_PEN_GEOMETRY,
  APP_SCREEN_PEN_GEOMETRY_SCHEMA,
  APP_SCREEN_PEN_PARITY_CHECKS,
  APP_SCREEN_PEN_PENDING_DECISIONS,
  classifyPenParity,
  type PenParityCheck,
  type PenParitySource,
  penParityValue,
} from '@/data/appScreens';

const repoRoot = path.resolve(__dirname, '../../../../..');
const readRepoFile = (file: string) =>
  fs.readFileSync(path.join(repoRoot, file), 'utf8');

const DESIGN_SYSTEM_CSS = readRepoFile('apps/web/styles/design-system.css');
const ROOT_FONT_SIZE_PX = 16;
const TAILWIND_SPACING_PX = 4;

/** Class strings the `class-export` sources resolve against. */
const CLASS_EXPORTS: Readonly<
  Record<string, { readonly file: string; readonly value: string }>
> = {
  PAGE_TOOLBAR_CONTAINER_CLASS: {
    file: 'apps/web/components/organisms/table/molecules/PageToolbar.tsx',
    value: PAGE_TOOLBAR_CONTAINER_CLASS,
  },
  TABLE_TOOLBAR_SHELL_CLASS: {
    file: 'apps/web/components/organisms/table/molecules/PageToolbar.tsx',
    value: TABLE_TOOLBAR_SHELL_CLASS,
  },
  'getSidebarNavRowClassName({ calm: true })': {
    file: 'apps/web/components/shell/SidebarNavItem.tsx',
    value: getSidebarNavRowClassName({ calm: true }),
  },
};

function cssLength(raw: string, label: string): number {
  const value = raw.trim();
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (px) return Number(px[1]);
  const rem = /^(-?\d+(?:\.\d+)?)rem$/.exec(value);
  if (rem) return Number(rem[1]) * ROOT_FONT_SIZE_PX;
  throw new Error(`${label}: unsupported CSS length "${value}"`);
}

function cssVar(token: string): number {
  const escaped = token.replace(/[-]/g, '\\-');
  const match = new RegExp(`^\\s*${escaped}:\\s*([^;]+);`, 'm').exec(
    DESIGN_SYSTEM_CSS
  );
  if (!match) throw new Error(`${token} is not declared in design-system.css`);
  return cssLength(match[1], token);
}

function utilityValue(classes: string, utility: string, label: string): number {
  const values = classes
    .split(/\s+/)
    .filter(token => token.length > 0 && !token.includes(':'))
    .flatMap(token => {
      if (!token.startsWith(`${utility}-`)) return [];
      const raw = token.slice(utility.length + 1);
      if (/^\d+(?:\.\d+)?$/.test(raw))
        return [Number(raw) * TAILWIND_SPACING_PX];
      const variable = /^\((--[\w-]+)\)$/.exec(raw);
      if (variable) return [cssVar(variable[1])];
      const arbitrary = /^\[(.+)\]$/.exec(raw);
      if (arbitrary) return [cssLength(arbitrary[1], label)];
      return [];
    });
  if (values.length === 0) {
    throw new Error(`${label}: no \`${utility}-*\` utility in "${classes}"`);
  }
  // tailwind-merge keeps the last conflicting utility.
  return values[values.length - 1];
}

function resolveSource(source: PenParitySource, label: string): number {
  switch (source.kind) {
    case 'css-var':
      return cssVar(source.token);
    case 'class-export': {
      const entry = CLASS_EXPORTS[source.exportRef];
      if (!entry)
        throw new Error(`${label}: unknown export ${source.exportRef}`);
      if (entry.file !== source.file) {
        throw new Error(`${label}: ${source.exportRef} lives in ${entry.file}`);
      }
      return utilityValue(entry.value, source.utility, label);
    }
    case 'numeric-export': {
      const match = new RegExp(
        `export const ${source.name}\\s*=\\s*(\\d+(?:\\.\\d+)?)`
      ).exec(readRepoFile(source.file));
      if (!match) throw new Error(`${label}: ${source.name} not found`);
      return Number(match[1]);
    }
    case 'structural':
      if (!readRepoFile(source.file).includes(source.contains)) {
        throw new Error(
          `${label}: structural proof missing from ${source.file}: ${source.contains}`
        );
      }
      return source.value;
  }
}

function penValue(check: PenParityCheck): number {
  const value = penParityValue(APP_SCREEN_PEN_GEOMETRY, check);
  if (value === undefined) {
    throw new Error(
      `${check.id}: ${check.masterId}${check.slotId ? `/${check.slotId}` : ''}.${check.property} is not in pen-geometry.json`
    );
  }
  return value;
}

describe('app-screen Pen parity gate (JOV-6776)', () => {
  it('commits a readback with provenance for the locked canonical Pen file', () => {
    const { provenance } = APP_SCREEN_PEN_GEOMETRY;
    expect(APP_SCREEN_PEN_GEOMETRY.schema).toBe(APP_SCREEN_PEN_GEOMETRY_SCHEMA);
    expect(provenance.diskSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isNaN(Date.parse(provenance.readAt))).toBe(false);
    expect(Number.isNaN(Date.parse(provenance.diskMtime))).toBe(false);
    expect(provenance.readMethod).toMatch(/read-only/);

    const locks = JSON.parse(
      readRepoFile('scripts/agent/pen-workspace-locks.json')
    ) as {
      profiles: Record<string, { canonical_path: string }>;
    };
    expect(locks.profiles[provenance.lockProfile]?.canonical_path).toBe(
      provenance.penFile
    );
  });

  it('keeps check ids unique and every check readable from the export', () => {
    const ids = APP_SCREEN_PEN_PARITY_CHECKS.map(check => check.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const check of APP_SCREEN_PEN_PARITY_CHECKS) {
      expect(() => penValue(check), check.id).not.toThrow();
    }
  });

  it('gates every bound registry master with at least one parity check', () => {
    for (const component of APP_SCREEN_COMPONENT_REGISTRY) {
      const root: string | null = component.penRootId;
      if (root === null) continue;
      expect(
        APP_SCREEN_PEN_PARITY_CHECKS.some(check => check.masterId === root),
        `${component.id} -> ${root}`
      ).toBe(true);
    }
  });

  it('keeps pending decisions dated, unique, and attached to real checks', () => {
    const checkIds = new Set(APP_SCREEN_PEN_PARITY_CHECKS.map(c => c.id));
    const pendingIds = APP_SCREEN_PEN_PENDING_DECISIONS.map(d => d.checkId);
    expect(new Set(pendingIds).size).toBe(pendingIds.length);
    for (const decision of APP_SCREEN_PEN_PENDING_DECISIONS) {
      expect(checkIds.has(decision.checkId), decision.checkId).toBe(true);
      expect(decision.decisionId).toMatch(/^D\d+$/);
      expect(decision.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(decision.penValue).not.toBe(decision.sourceValue);
      expect(decision.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it('fails closed when Pen and source disagree outside a pending decision', () => {
    const drift: string[] = [];
    const pending: string[] = [];
    const resolved: string[] = [];
    for (const check of APP_SCREEN_PEN_PARITY_CHECKS) {
      const pen = penValue(check);
      const source = resolveSource(check.source, check.id);
      const outcome = classifyPenParity(check.id, pen, source);
      const line = `${check.id}: Pen ${check.masterId} = ${pen}, source = ${source}`;
      if (outcome.status === 'drift') {
        drift.push(
          outcome.decision
            ? `${line} (recorded ${outcome.decision.decisionId}: Pen ${outcome.decision.penValue} vs source ${outcome.decision.sourceValue})`
            : line
        );
      } else if (outcome.status === 'pending') {
        pending.push(`${outcome.decision.decisionId} ${line}`);
      } else if (outcome.status === 'resolved') {
        resolved.push(`${outcome.decision.decisionId} ${line}`);
      }
    }
    if (pending.length > 0) {
      console.info(
        `[pen-parity] pending design decisions (not fatal):\n${pending.join('\n')}`
      );
    }
    if (resolved.length > 0) {
      console.info(
        `[pen-parity] converged; delete these pending entries:\n${resolved.join('\n')}`
      );
    }
    expect(drift, 'Pen-vs-code geometry drift').toEqual([]);
  });

  it('classifies new, recorded, changed, and converged disagreements', () => {
    const recorded = {
      decisionId: 'D99' as const,
      checkId: 'fixture',
      recordedOn: '2026-09-27',
      penValue: 48,
      sourceValue: 44,
      summary: 'fixture',
    };
    expect(classifyPenParity('fixture', 44, 44, []).status).toBe('match');
    expect(classifyPenParity('fixture', 48, 44, []).status).toBe('drift');
    expect(classifyPenParity('fixture', 48, 44, [recorded]).status).toBe(
      'pending'
    );
    expect(classifyPenParity('fixture', 48, 40, [recorded]).status).toBe(
      'drift'
    );
    expect(classifyPenParity('fixture', 52, 44, [recorded]).status).toBe(
      'drift'
    );
    expect(classifyPenParity('fixture', 44, 44, [recorded]).status).toBe(
      'resolved'
    );
  });

  it('resolves source values the way Tailwind renders them', () => {
    expect(utilityValue('h-7 px-2.5 gap-x-2', 'px', 't')).toBe(10);
    expect(utilityValue('gap-x-2.5 gap-x-(--space-2-5)', 'gap-x', 't')).toBe(
      10
    );
    expect(utilityValue('lg:h-12 h-11', 'h', 't')).toBe(44);
    expect(utilityValue('gap-x-2 gap-1.5', 'gap', 't')).toBe(6);
    expect(() => utilityValue('flex', 'h', 't')).toThrow(/no `h-\*`/);
  });
});
