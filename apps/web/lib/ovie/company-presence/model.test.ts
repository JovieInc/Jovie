import { describe, expect, it } from 'vitest';
import {
  COMPANY_PRESENCE_CHECK_IDS,
  type CompanyPresenceCheck,
  type CompanyPresenceCheckId,
  type CompanyPresencePage,
  filterCompanyPresencePages,
  getCompanyPageLastCheckedAt,
  getCompanyPageSignals,
  getCompanyPageStatus,
  sortCompanyPresencePages,
} from './model';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const RECENT = '2026-09-26T12:00:00.000Z';

const unconfigured: CompanyPresenceCheck = {
  state: 'unconfigured',
  reason: 'No source yet.',
};

function measured(
  outcome: 'pass' | 'warn' | 'fail',
  checkedAt = RECENT
): CompanyPresenceCheck {
  return { state: 'measured', outcome, summary: outcome, checkedAt };
}

function page(
  overrides: Partial<Record<CompanyPresenceCheckId, CompanyPresenceCheck>> = {},
  path = '/pricing'
): CompanyPresencePage {
  return {
    id: `marketing:${path}`,
    path,
    label: 'Pricing',
    kind: 'marketing',
    checks: {
      indexed: unconfigured,
      seo_certification: unconfigured,
      copy_gate: unconfigured,
      lighthouse: unconfigured,
      ...overrides,
    },
  };
}

describe('getCompanyPageStatus', () => {
  it('reports Unconfigured, not a failure, when no source measured the page', () => {
    const status = getCompanyPageStatus(page(), NOW);
    expect(status.label).toBe('Unconfigured');
    expect(status.tone).toBe('neutral');
    expect(status.needsAttention).toBe(false);
  });

  it('puts failing checks first as Needs Review', () => {
    const status = getCompanyPageStatus(
      page({ lighthouse: measured('fail'), indexed: measured('warn') }),
      NOW
    );
    expect(status.label).toBe('Needs Review');
    expect(status.tone).toBe('error');
    expect(status.nextAction).toContain('Lighthouse');
  });

  it('flags warnings as Needs Attention', () => {
    const status = getCompanyPageStatus(
      page({ copy_gate: measured('warn') }),
      NOW
    );
    expect(status.label).toBe('Needs Attention');
    expect(status.nextAction).toContain('Copy Gate');
  });

  it('keeps passing pages with missing sources as Partially Measured', () => {
    expect(
      getCompanyPageStatus(page({ indexed: measured('pass') }), NOW).label
    ).toBe('Partially Measured');
  });

  it('marks pages Healthy only when every check passed', () => {
    const allPass = Object.fromEntries(
      COMPANY_PRESENCE_CHECK_IDS.map(id => [id, measured('pass')])
    );
    expect(getCompanyPageStatus(page(allPass), NOW).label).toBe('Healthy');
  });

  it('marks pages Stale when the newest check is older than two weeks', () => {
    const status = getCompanyPageStatus(
      page({ indexed: measured('pass', '2026-08-01T00:00:00.000Z') }),
      NOW
    );
    expect(status.label).toBe('Stale');
  });
});

describe('getCompanyPageSignals', () => {
  it('states each unconfigured source with its reason and never a number', () => {
    const signals = getCompanyPageSignals(page());
    expect(signals).toHaveLength(COMPANY_PRESENCE_CHECK_IDS.length);
    for (const signal of signals) {
      expect(signal.label).toMatch(/Unconfigured$/);
      expect(signal.detail).toBe('No source yet.');
      expect(signal.label).not.toMatch(/\d/);
    }
  });

  it('orders blockers before findings before quiet state', () => {
    const kinds = getCompanyPageSignals(
      page({ indexed: measured('pass'), lighthouse: measured('fail') })
    ).map(signal => signal.kind);
    expect(kinds[0]).toBe('blocker');
    expect(kinds.slice(1).every(kind => kind === 'state')).toBe(true);
  });

  it('reports warnings as findings', () => {
    const signals = getCompanyPageSignals(
      page({ copy_gate: measured('warn') })
    );
    expect(signals[0]).toMatchObject({ kind: 'finding', tone: 'warning' });
  });
});

describe('page helpers', () => {
  it('returns null last-checked when nothing measured the page', () => {
    expect(getCompanyPageLastCheckedAt(page())).toBeNull();
  });

  it('returns the newest measured timestamp', () => {
    expect(
      getCompanyPageLastCheckedAt(
        page({
          indexed: measured('pass', '2026-09-01T00:00:00.000Z'),
          lighthouse: measured('pass', RECENT),
        })
      )
    ).toBe(RECENT);
  });

  it('sorts attention first, then by path', () => {
    const sorted = sortCompanyPresencePages(
      [
        page({}, '/b'),
        page({}, '/a'),
        page({ lighthouse: measured('fail') }, '/z'),
      ],
      NOW
    );
    expect(sorted.map(item => item.path)).toEqual(['/z', '/a', '/b']);
  });

  it('filters by page kind', () => {
    const pages = [page(), { ...page({}, '/tim'), kind: 'profile' as const }];
    expect(filterCompanyPresencePages(pages, 'all')).toHaveLength(2);
    expect(
      filterCompanyPresencePages(pages, 'profile').map(item => item.path)
    ).toEqual(['/tim']);
  });
});
