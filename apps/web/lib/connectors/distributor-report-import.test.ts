import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DISTRIBUTOR_MANIFESTS } from './distributor-manifests';
import {
  type DistributorColumnMapping,
  type DistributorReportContext,
  distributorColumnMappingSchema,
  distributorReportReceiptSchema,
} from './distributor-report-contract';
import {
  assertNoDistributorReportOverlap,
  enterDistributorStatementSummary,
  importMappedDistributorReport,
  MAX_DISTRIBUTOR_REPORT_BYTES,
  readOwnerColumnMapping,
  registerOwnerColumnMapping,
} from './distributor-report-import';
import type { RoyaltySource } from './royalty-contract';

const owner = 'financial-owner';
const period = { start: '2026-01-01', end: '2026-01-31' };
const mapping: DistributorColumnMapping = {
  contractVersion: 'jovie.distributor-column-mapping/v1',
  id: 'my-awal-layout',
  ownerUserId: owner,
  distributorId: 'awal',
  accountId: 'account-1',
  version: 1,
  sourceFormatVersion: { status: 'identified', value: 'owner-report-2026' },
  columns: ['Amount', 'Currency', 'ISRC', 'Title'],
  granularity: 'statement_line',
  monetaryBasis: 'net_earnings',
  amountColumn: 'Amount',
  currency: { mode: 'column', column: 'Currency' },
  fields: { isrc: 'ISRC', title: 'Title' },
};
const context: DistributorReportContext = {
  statementId: 'jan-2026',
  issuedOn: '2026-03-01',
  periods: {
    activity: period,
    reporting: { start: '2026-03-01', end: '2026-03-31' },
    payment: null,
  },
  originalEvidenceRef: 'private-artifact:original-report',
  monetaryBasis: 'net_earnings',
  monetaryBasisLocator: 'report legend: net earnings',
  currencyLocator: 'Currency column',
  statementCurrency: null,
};
const csv =
  'Amount,Currency,ISRC,Title\n0.000000000000000001,GBP,GBABC2600001,"Song, part one"\n-0.000000000000000002,GBP,GBABC2600001,"Song, part one"\n';

function sourceFor(
  bytes: Uint8Array,
  patch: Partial<RoyaltySource> = {}
): RoyaltySource {
  const fileSha256 = createHash('sha256').update(bytes).digest('hex');
  const distributorId = patch.distributorId ?? 'awal';
  const accountId = patch.accountId ?? 'account-1';
  return {
    distributorId,
    accountId,
    transport: 'file_import',
    fileName: 'authorized-report.csv',
    fileSha256,
    importedAt: '2026-04-01T12:00:00Z',
    format: 'csv',
    formatVersion: mapping.sourceFormatVersion,
    parser: { id: 'submitted-source', version: '1.0.0' },
    ...patch,
    approval: {
      receiptRef: 'private-authorization-receipt',
      approvedByUserId: owner,
      approvedAt: '2026-04-01T11:59:00Z',
      distributorId,
      accountId,
      fileSha256,
      purpose: 'royalty_import',
      authority: 'account_holder',
      ...patch.approval,
    },
  };
}
function mappedInput(text = csv, sourcePatch: Partial<RoyaltySource> = {}) {
  const bytes = new TextEncoder().encode(text);
  return {
    actorUserId: owner,
    bytes,
    source: sourceFor(bytes, sourcePatch),
    mapping,
    context,
    existingReports: [] as unknown[],
  };
}
function summaryInput() {
  const bytes = new TextEncoder().encode(
    '%PDF retained original statement evidence'
  );
  return {
    actorUserId: owner,
    bytes,
    source: sourceFor(bytes, {
      distributorId: 'unitedmasters',
      format: 'pdf',
      formatVersion: { status: 'unknown' },
      fileName: 'monthly-statement.pdf',
    }),
    context: {
      ...context,
      statementCurrency: {
        originalCurrency: 'GBP',
        sourceLocator: 'page 1: statement currency',
      },
    },
    values: [
      {
        money: { amount: '12.3400', originalCurrency: 'GBP' },
        page: 1,
        section: 'Monthly earnings total',
      },
    ],
    existingReports: [] as unknown[],
  };
}

describe('explicit distributor report mappings', () => {
  it('registers immutable owner-scoped versions and rejects overwrites or scope changes', () => {
    const saved = registerOwnerColumnMapping(owner, mapping, []);
    expect(
      registerOwnerColumnMapping(owner, JSON.parse(JSON.stringify(mapping)), [
        saved,
      ])
    ).toEqual(saved);
    expect(
      registerOwnerColumnMapping(owner, { ...mapping, version: 2 }, [saved])
        .version
    ).toBe(2);
    expect(() =>
      registerOwnerColumnMapping(owner, { ...mapping, fields: {} }, [saved])
    ).toThrow(/immutable/);
    expect(() =>
      registerOwnerColumnMapping(
        owner,
        { ...mapping, accountId: 'other-account', version: 2 },
        [saved]
      )
    ).toThrow(/identity/);
    expect(() =>
      registerOwnerColumnMapping(owner, { ...mapping, version: 3 }, [saved])
    ).toThrow(/sequentially/);
    expect(() =>
      registerOwnerColumnMapping(owner, mapping, [
        { ...saved, ownerUserId: 'other-owner' },
      ])
    ).toThrow(/owner/);
  });
  it('reuses a serialized owner mapping across sources and retains exact money and evidence', () => {
    const saved = JSON.parse(
      JSON.stringify(readOwnerColumnMapping(owner, mapping))
    );
    const first = importMappedDistributorReport({
      ...mappedInput(),
      mapping: saved,
    });
    const second = importMappedDistributorReport({
      ...mappedInput(
        csv.replace('0.000000000000000001', '2.000000000000000001')
      ),
      mapping: saved,
    });
    expect(first.mapping).toEqual(second.mapping);
    expect(first.mappingSha256).toBe(second.mappingSha256);
    expect(first.statement.header.source.fileSha256).not.toBe(
      second.statement.header.source.fileSha256
    );
    expect(first.statement.header).toMatchObject({
      granularity: 'statement_line',
      totals: [{ amount: '-0.000000000000000001', originalCurrency: 'GBP' }],
      source: {
        distributorId: 'awal',
        accountId: 'account-1',
        formatVersion: mapping.sourceFormatVersion,
      },
    });
    expect(first.statement.lines[0]).toMatchObject({
      isrc: 'GBABC2600001',
      title: 'Song, part one',
      sourceLocator: 'data-record:1',
    });
    expect(first.originalEvidenceRef).toBe(context.originalEvidenceRef);
    expect(first.monetaryBasis).toBe('net_earnings');
  });

  it('requires a new mapping for reordered, added, or renamed columns and changed versions', () => {
    for (const text of [
      csv.replace('Amount,Currency', 'Currency,Amount'),
      csv.replace('Title\n', 'Title,Extra\n'),
      csv.replace('Amount,', 'Net,'),
    ]) {
      expect(() => importMappedDistributorReport(mappedInput(text))).toThrow();
    }
    expect(() =>
      importMappedDistributorReport(
        mappedInput(csv, {
          formatVersion: { status: 'identified', value: 'new-layout' },
        })
      )
    ).toThrow(/version/);
    const revised = {
      ...mapping,
      version: 2,
      columns: ['Net', ...mapping.columns.slice(1)],
      amountColumn: 'Net',
    };
    const result = importMappedDistributorReport({
      ...mappedInput(csv.replace('Amount,', 'Net,')),
      mapping: revised,
    });
    expect(result.mapping?.version).toBe(2);
    expect(result.mappingSha256).not.toBe(
      importMappedDistributorReport(mappedInput()).mappingSha256
    );
  });

  it('uses explicit statement currency evidence without assuming USD or an AWAL version', () => {
    const input = mappedInput('Amount,ISRC\n1.2300,GBABC2600001\n');
    const result = importMappedDistributorReport({
      ...input,
      mapping: {
        ...mapping,
        columns: ['Amount', 'ISRC'],
        fields: { isrc: 'ISRC' },
        currency: { mode: 'statement' },
      },
      context: {
        ...context,
        statementCurrency: {
          originalCurrency: 'EUR',
          sourceLocator: 'header: currency',
        },
      },
    });
    expect(result.statement.header.totals).toEqual([
      { amount: '1.2300', originalCurrency: 'EUR' },
    ]);
    expect(result.statementCurrency?.sourceLocator).toBe('header: currency');
    expect(() =>
      importMappedDistributorReport({
        ...input,
        mapping: {
          ...mapping,
          columns: ['Amount', 'ISRC'],
          fields: { isrc: 'ISRC' },
          currency: { mode: 'statement' },
        },
      })
    ).toThrow(/currency evidence/);
    expect(() =>
      importMappedDistributorReport({
        ...mappedInput(),
        context: {
          ...context,
          statementCurrency: {
            originalCurrency: 'USD',
            sourceLocator: 'header',
          },
        },
      })
    ).toThrow(/conflicts/);
    expect(
      distributorColumnMappingSchema.safeParse({
        ...mapping,
        sourceFormatVersion: { status: 'unknown' },
      }).success
    ).toBe(false);
    expect(DISTRIBUTOR_MANIFESTS.awal.reports[0].documentationStatus).toBe(
      'unverified'
    );
    expect(DISTRIBUTOR_MANIFESTS.awal.automatedAccess.availability).toBe(
      'unavailable'
    );
  });

  it('supports approved additional distributors using the same TSV and JSON contract', () => {
    for (const format of ['tsv', 'json'] as const) {
      const columns = ['Amount', 'Currency'];
      const rows = [
        ['0', 'JPY'],
        ['100000000000000000000.12', 'EUR'],
        ['-1.02', 'EUR'],
      ];
      const text =
        format === 'json'
          ? JSON.stringify({ columns, rows })
          : [columns, ...rows].map(row => row.join('\t')).join('\n');
      const result = importMappedDistributorReport({
        ...mappedInput(text, {
          distributorId: 'routenote',
          format,
          formatVersion: { status: 'unversioned' },
        }),
        mapping: {
          ...mapping,
          distributorId: 'routenote',
          sourceFormatVersion: { status: 'unversioned' },
          columns,
          fields: {},
        },
      });
      expect(result.statement.header.totals).toEqual([
        { amount: '99999999999999999999.10', originalCurrency: 'EUR' },
        { amount: '0', originalCurrency: 'JPY' },
      ]);
      expect(result.statement.header.source.distributorId).toBe('routenote');
    }
    expect(
      distributorColumnMappingSchema.safeParse({
        ...mapping,
        distributorId: 'unapproved-provider',
      }).success
    ).toBe(false);
  });

  it('preserves legitimate identical rows and supports mapped summary totals without attribution', () => {
    const detailed = importMappedDistributorReport(
      mappedInput(
        'Amount,Currency,ISRC,Title\n1,GBP,GBABC2600001,Song\n1,GBP,GBABC2600001,Song\n'
      )
    );
    expect(detailed.statement.lines.map(line => line.lineId)).toEqual([
      'record:1',
      'record:2',
    ]);
    expect(detailed.statement.header.totals[0].amount).toBe('2');
    const unidentified = importMappedDistributorReport(
      mappedInput('Amount,Currency,ISRC,Title\n0,GBP,,\n')
    );
    expect(unidentified.statement.lines[0]).toMatchObject({
      isrc: null,
      title: null,
    });
    const input = mappedInput('Amount,Currency\n1,GBP\n');
    const summary = importMappedDistributorReport({
      ...input,
      mapping: {
        ...mapping,
        columns: ['Amount', 'Currency'],
        granularity: 'statement_summary',
        fields: {},
      },
    });
    expect(summary.statement.header.granularity).toBe('statement_summary');
    expect(summary.statement.lines).toEqual([]);
    expect(() =>
      importMappedDistributorReport({
        ...mappedInput('Amount,Currency\n1,GBP\n1,GBP\n'),
        mapping: summary.mapping,
      })
    ).toThrow(/one total per currency/);
    expect(
      distributorColumnMappingSchema.safeParse({
        ...mapping,
        granularity: 'statement_summary',
      }).success
    ).toBe(false);
  });

  it('rejects missing evidence, unknown money basis, and unsupported money or currencies', () => {
    for (const patch of [
      { originalEvidenceRef: '' },
      { monetaryBasis: 'unknown' },
      { monetaryBasisLocator: '' },
      { currencyLocator: '' },
      { periods: { activity: null, reporting: null, payment: null } },
      { monetaryBasis: 'gross_earnings' },
    ])
      expect(() =>
        importMappedDistributorReport({
          ...mappedInput(),
          context: { ...context, ...patch },
        })
      ).toThrow();
    for (const text of [
      csv.replace('GBP', 'USD').replace(/GBP/g, ''),
      csv.replace(/GBP/g, 'ZZZ'),
      csv.replace('0.000000000000000001', '$1'),
      csv.replace('0.000000000000000001', '1e-6'),
    ]) {
      expect(() => importMappedDistributorReport(mappedInput(text))).toThrow();
    }
    const input = mappedInput();
    expect(() =>
      importMappedDistributorReport({
        ...input,
        source: { ...input.source, approval: undefined },
      })
    ).toThrow();
    expect(() =>
      importMappedDistributorReport({
        ...input,
        bytes: new TextEncoder().encode(csv + '\n'),
      })
    ).toThrow(/digest/);
    expect(() =>
      importMappedDistributorReport({
        ...input,
        source: {
          ...input.source,
          approval: { ...input.source.approval, fileSha256: '0'.repeat(64) },
        },
      })
    ).toThrow();
    expect(() =>
      importMappedDistributorReport(mappedInput(csv, { format: 'pdf' }))
    ).toThrow(/require CSV/);
  });

  it('isolates mapping and report reuse by owner, provider, and account', () => {
    expect(() => readOwnerColumnMapping('collaborator', mapping)).toThrow(
      /owner/
    );
    expect(() =>
      importMappedDistributorReport({
        ...mappedInput(),
        actorUserId: 'collaborator',
      })
    ).toThrow(/owner/);
    expect(() =>
      importMappedDistributorReport({
        ...mappedInput(),
        mapping: { ...mapping, ownerUserId: 'collaborator' },
      })
    ).toThrow(/owner/);
    expect(() =>
      importMappedDistributorReport(
        mappedInput(csv, { accountId: 'other-account' })
      )
    ).toThrow(/scope/);
    expect(() =>
      importMappedDistributorReport(
        mappedInput(csv, { distributorId: 'tunecore' })
      )
    ).toThrow(/scope/);
    const input = mappedInput();
    expect(() =>
      importMappedDistributorReport({
        ...input,
        source: {
          ...input.source,
          approval: {
            ...input.source.approval,
            approvedByUserId: 'collaborator',
          },
        },
      })
    ).toThrow(/owner/);
    const report = importMappedDistributorReport(input);
    expect(() =>
      assertNoDistributorReportOverlap('collaborator', report, [])
    ).toThrow(/owner/);
    expect(
      distributorReportReceiptSchema.safeParse({
        ...report,
        ownerUserId: 'collaborator',
      }).success
    ).toBe(false);
  });

  it('rejects duplicate or nonexistent header selections and malformed or oversized input', () => {
    for (const patch of [
      { columns: ['Amount', 'Amount'] },
      { amountColumn: 'absent' },
      { fields: { isrc: 'Amount' } },
    ]) {
      expect(
        distributorColumnMappingSchema.safeParse({ ...mapping, ...patch })
          .success
      ).toBe(false);
    }
    for (const text of [
      '',
      'Amount,Currency\n1\n',
      'Amount,Currency\n"unterminated',
      JSON.stringify({ columns: ['Amount', 'Currency'], rows: [['1']] }),
    ]) {
      expect(() =>
        importMappedDistributorReport(
          mappedInput(text, { format: text.startsWith('{') ? 'json' : 'csv' })
        )
      ).toThrow();
    }
    const input = mappedInput();
    expect(() =>
      importMappedDistributorReport({
        ...input,
        bytes: new Uint8Array(MAX_DISTRIBUTOR_REPORT_BYTES + 1),
      })
    ).toThrow(/size/);
    const bytes = new Uint8Array([255]);
    expect(() =>
      importMappedDistributorReport({
        ...input,
        bytes,
        source: sourceFor(bytes),
      })
    ).toThrow();
  });
});

describe('manual UnitedMasters statement evidence', () => {
  it('retains original PDF evidence, declared currency, and exact page/section values with a manual label', () => {
    const input = summaryInput();
    const result = enterDistributorStatementSummary(input);
    expect(result).toMatchObject({
      entryMode: 'manual_summary',
      mapping: null,
      mappingSha256: null,
      manualValues: input.values,
      originalEvidenceRef: context.originalEvidenceRef,
    });
    expect(result.statement.header).toMatchObject({
      granularity: 'statement_summary',
      totals: [input.values[0].money],
      sourceLocator: 'page:1;section:Monthly earnings total',
      source: {
        distributorId: 'unitedmasters',
        fileSha256: input.source.fileSha256,
        format: 'pdf',
        formatVersion: { status: 'unknown' },
        parser: { id: 'jovie.manual-statement-summary', version: '1.0.0' },
      },
    });
    expect(result.statement.lines).toEqual([]);
    expect(
      DISTRIBUTOR_MANIFESTS.unitedmasters.automatedAccess.availability
    ).toBe('unavailable');
  });

  it('requires original evidence, page/section, money basis, and currency; refuses inferred ISRC values', () => {
    const input = summaryInput();
    for (const patch of [
      { page: 0 },
      { section: '' },
      { isrc: 'GBABC2600001' },
      { money: { amount: '2', originalCurrency: 'USD' } },
    ]) {
      expect(() =>
        enterDistributorStatementSummary({
          ...input,
          values: [{ ...input.values[0], ...patch }],
        })
      ).toThrow();
    }
    expect(() =>
      enterDistributorStatementSummary({ ...input, values: [] })
    ).toThrow();
    expect(() =>
      enterDistributorStatementSummary({
        ...input,
        values: [...input.values, ...input.values],
      })
    ).toThrow(/one total per currency/);
    expect(() =>
      enterDistributorStatementSummary({
        ...input,
        context: { ...input.context, statementCurrency: null },
      })
    ).toThrow(/currency/);
    expect(() =>
      enterDistributorStatementSummary({
        ...input,
        context: { ...input.context, originalEvidenceRef: '' },
      })
    ).toThrow();
    expect(() =>
      enterDistributorStatementSummary({
        ...input,
        context: { ...input.context, monetaryBasis: 'unknown' },
      })
    ).toThrow();
    expect(() =>
      enterDistributorStatementSummary({
        ...input,
        actorUserId: 'collaborator',
      })
    ).toThrow(/owner/);
    expect(() =>
      enterDistributorStatementSummary({
        ...input,
        bytes: new TextEncoder().encode('different original'),
      })
    ).toThrow(/digest/);
    const result = enterDistributorStatementSummary(input);
    expect(
      distributorReportReceiptSchema.safeParse({
        ...result,
        manualValues: [
          {
            ...input.values[0],
            money: { amount: '999', originalCurrency: 'GBP' },
          },
        ],
      }).success
    ).toBe(false);
  });
});

describe('summary and detail overlap', () => {
  function sameAccountDetail() {
    return importMappedDistributorReport({
      ...mappedInput(csv, { distributorId: 'unitedmasters' }),
      mapping: { ...mapping, distributorId: 'unitedmasters' },
    });
  }
  it('rejects overlapping summary/detail in either import order, independent of ids and currency', () => {
    const summary = enterDistributorStatementSummary(summaryInput());
    const detail = sameAccountDetail();
    // Distinct provider statement identifiers cannot bypass period checks.
    detail.statement.header.statementId = 'detailed-jan';
    detail.statement.lines.forEach(line => {
      line.statementId = 'detailed-jan';
    });
    expect(() =>
      assertNoDistributorReportOverlap(owner, detail, [summary])
    ).toThrow(/Overlapping/);
    expect(() =>
      assertNoDistributorReportOverlap(owner, summary, [detail])
    ).toThrow(/Overlapping/);
    expect(() =>
      enterDistributorStatementSummary({
        ...summaryInput(),
        context: { ...summaryInput().context, statementId: 'summary-2' },
        existingReports: [detail],
      })
    ).toThrow(/Overlapping/);
    expect(() =>
      importMappedDistributorReport({
        ...mappedInput(csv, { distributorId: 'unitedmasters' }),
        mapping: { ...mapping, distributorId: 'unitedmasters' },
        context: { ...context, statementId: 'detail-2' },
        existingReports: [summary],
      })
    ).toThrow(/Overlapping/);
  });

  it('fails closed for partial overlap and incomparable dates; detects replay and duplicate ids', () => {
    const summary = enterDistributorStatementSummary(summaryInput());
    const detail = sameAccountDetail();
    expect(() =>
      assertNoDistributorReportOverlap(owner, summary, [summary])
    ).toThrow(/Duplicate/);
    detail.statement.header.statementId = 'detail';
    detail.statement.lines.forEach(line => {
      line.statementId = 'detail';
    });
    detail.statement.header.periods.activity = {
      start: '2026-01-31',
      end: '2026-02-28',
    };
    expect(() =>
      assertNoDistributorReportOverlap(owner, summary, [detail])
    ).toThrow(/Overlapping/);
    detail.statement.header.periods.activity = null;
    detail.statement.header.periods.reporting = null;
    expect(() =>
      assertNoDistributorReportOverlap(owner, summary, [detail])
    ).toThrow(/Overlapping/);
  });

  it('allows nonoverlapping activity periods, separate accounts, providers, and detail-only inputs', () => {
    const summary = enterDistributorStatementSummary(summaryInput());
    const detail = sameAccountDetail();
    detail.statement.header.statementId = 'detail';
    detail.statement.lines.forEach(line => {
      line.statementId = 'detail';
    });
    detail.statement.header.periods.activity = {
      start: '2025-12-01',
      end: '2025-12-31',
    };
    expect(() =>
      assertNoDistributorReportOverlap(owner, summary, [detail])
    ).not.toThrow();
    expect(() =>
      assertNoDistributorReportOverlap(owner, summary, [
        importMappedDistributorReport(mappedInput()),
      ])
    ).not.toThrow();
    const accountTwo = importMappedDistributorReport({
      ...mappedInput(csv, {
        distributorId: 'unitedmasters',
        accountId: 'account-2',
      }),
      mapping: {
        ...mapping,
        distributorId: 'unitedmasters',
        accountId: 'account-2',
      },
    });
    expect(() =>
      assertNoDistributorReportOverlap(owner, summary, [accountTwo])
    ).not.toThrow();
    const otherDetail = importMappedDistributorReport({
      ...mappedInput(csv + '\n'),
      context: { ...context, statementId: 'other-detail' },
    });
    expect(() =>
      assertNoDistributorReportOverlap(owner, otherDetail, [
        importMappedDistributorReport(mappedInput()),
      ])
    ).not.toThrow();
  });
});
