import { describe, expect, it } from 'vitest';
import {
  exactDecimalSchema,
  royaltyCatalogRecordSchema,
  royaltyMoneySchema,
  royaltyPayoutEvidenceSchema,
  royaltyPeriodSchema,
  royaltySourceSchema,
  royaltyStatementHeaderSchema,
  royaltyStatementLineSchema,
  royaltyStatementSchema,
} from './royalty-contract';

const period = { start: '2026-01-01', end: '2026-01-31' };
const periods = {
  activity: period,
  reporting: { start: '2026-03-01', end: '2026-03-31' },
  payment: null,
};
const money = { amount: '0.000000000000000001', originalCurrency: 'EUR' };
const source = {
  distributorId: 'tunecore',
  accountId: 'account-1',
  transport: 'file_import',
  fileName: 'sales.csv',
  fileSha256: 'a'.repeat(64),
  importedAt: '2026-04-01T12:00:00Z',
  format: 'csv',
  formatVersion: { status: 'unknown' },
  parser: { id: 'test-statement-parser', version: '1.2.3' },
  approval: {
    receiptRef: 'approval-1',
    approvedByUserId: 'user-1',
    approvedAt: '2026-04-01T11:59:00Z',
    distributorId: 'tunecore',
    accountId: 'account-1',
    fileSha256: 'a'.repeat(64),
    purpose: 'royalty_import',
    authority: 'account_holder',
  },
};
const identifiers = {
  sourceRecordId: 'record-1',
  isrc: 'USABC2600001',
  upc: '123456789012',
};
const header = {
  contractVersion: 'jovie.royalty-statement/v1',
  statementId: 'statement-1',
  granularity: 'statement_line',
  issuedOn: null,
  periods,
  totals: [money],
  source,
  sourceLocator: 'file',
};
const line = {
  statementId: 'statement-1',
  lineId: 'line-1',
  ...identifiers,
  title: 'Track',
  store: 'store-1',
  territory: 'DE',
  usage: 'stream',
  quantity: '123',
  periods,
  money,
  settlementMoney: null,
  exchangeRate: null,
  sourceLocator: 'row:2',
};
const payout = {
  contractVersion: 'jovie.royalty-payout/v1',
  payoutId: 'payout-1',
  statementIds: ['statement-1'],
  status: 'provider_reported',
  money,
  periods,
  paidOn: null,
  confirmationEvidenceRef: null,
  source,
  sourceLocator: 'row:3',
};

describe('normalized royalty evidence', () => {
  it('preserves exact sub-cent, large, and negative amounts with original currencies', () => {
    for (const amount of [
      money.amount,
      '999999999999999999999999.123456789',
      '-0.0000001',
      '0',
      '1.2300',
    ]) {
      expect(royaltyMoneySchema.parse({ ...money, amount }).amount).toBe(
        amount
      );
    }
    expect(
      royaltyStatementSchema.parse({ header, lines: [line] }).lines[0].money
    ).toEqual(money);
  });
  it.each([
    0.1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '',
    ' ',
    ' 1',
    '1 ',
    '01.2',
    '.5',
    '1.',
    '1e-6',
    'NaN',
    'Infinity',
    '$1',
    '1,000.00',
    '+1',
    '1\n',
    '1'.repeat(129),
  ])('rejects malformed or lossy amounts: %s', amount => {
    expect(exactDecimalSchema.safeParse(amount).success).toBe(false);
  });
  it.each(['eur', 'EU', 'EURO', 'ZZZ', '', 123])(
    'rejects malformed currencies: %s',
    originalCurrency => {
      expect(
        royaltyMoneySchema.safeParse({ ...money, originalCurrency }).success
      ).toBe(false);
    }
  );
  it('rejects unknown money fields instead of silently converting currencies', () => {
    expect(
      royaltyMoneySchema.safeParse({ ...money, usdAmount: 1 }).success
    ).toBe(false);
    expect(royaltyMoneySchema.safeParse({ amount: '1' }).success).toBe(false);
  });
  it('keeps activity, reporting, and payment periods separate and unknown dates explicit', () => {
    expect(royaltyStatementHeaderSchema.parse(header).periods).toEqual(periods);
    expect(
      royaltyPeriodSchema.safeParse({ start: '2026-02-30', end: '2026-03-01' })
        .success
    ).toBe(false);
    expect(
      royaltyPeriodSchema.safeParse({ start: period.end, end: period.start })
        .success
    ).toBe(false);
    expect(
      royaltyStatementHeaderSchema.safeParse({
        ...header,
        periods: { activity: period },
      }).success
    ).toBe(false);
  });
  it('requires versioned parsers, immutable provenance, and approval of the exact file', () => {
    expect(royaltySourceSchema.parse(source)).toEqual(source);
    for (const patch of [
      { parser: { id: 'parser', version: 'latest' } },
      { fileSha256: 'not-a-hash' },
      { accountId: 'other-account' },
      { distributorId: 'distrokid' },
      { fileSha256: 'b'.repeat(64) },
      { approval: { ...source.approval, approvedAt: '2026-04-02T00:00:00Z' } },
      { approval: undefined },
      { transport: 'oauth' },
      { transport: 'api' },
      { transport: 'browser_automation' },
      { accessToken: 'not-a-token' },
    ])
      expect(
        royaltySourceSchema.safeParse({ ...source, ...patch }).success
      ).toBe(false);
  });
  it('validates catalog records and source identifiers without inventing canonical links', () => {
    const record = {
      contractVersion: 'jovie.royalty-catalog/v1',
      kind: 'recording',
      ...identifiers,
      title: 'Track',
      artists: ['Artist'],
      source,
      sourceLocator: 'row:2',
    };
    expect(royaltyCatalogRecordSchema.parse(record).isrc).toBe(
      identifiers.isrc
    );
    for (const patch of [
      { isrc: 'invalid' },
      { upc: 'invalid' },
      { artists: [] },
      { source: undefined },
      { sourceLocator: '' },
      { contractVersion: 'v2' },
    ]) {
      expect(
        royaltyCatalogRecordSchema.safeParse({ ...record, ...patch }).success
      ).toBe(false);
    }
  });
  it('requires statement membership, unique lines, and evidence at the claimed granularity', () => {
    expect(
      royaltyStatementSchema.safeParse({
        header,
        lines: [{ ...line, statementId: 'other' }],
      }).success
    ).toBe(false);
    expect(
      royaltyStatementSchema.safeParse({ header, lines: [line, line] }).success
    ).toBe(false);
    expect(
      royaltyStatementSchema.safeParse({
        header: { ...header, granularity: 'statement_summary' },
        lines: [line],
      }).success
    ).toBe(false);
    expect(
      royaltyStatementSchema.safeParse({
        header: { ...header, granularity: 'statement_summary' },
        lines: [],
      }).success
    ).toBe(true);
  });
  it('preserves original and settlement currencies only with a positive exact exchange rate', () => {
    const settlementMoney = { amount: '1.23456789', originalCurrency: 'USD' };
    expect(
      royaltyStatementLineSchema.parse({
        ...line,
        settlementMoney,
        exchangeRate: '0.00000001',
      }).money
    ).toEqual(money);
    for (const exchangeRate of [null, '0', '0.000', '-1', '1e-3']) {
      expect(
        royaltyStatementLineSchema.safeParse({
          ...line,
          settlementMoney,
          exchangeRate,
        }).success
      ).toBe(false);
    }
    expect(
      royaltyStatementLineSchema.safeParse({ ...line, exchangeRate: '1.2' })
        .success
    ).toBe(false);
  });
  it('distinguishes reported payouts from independent confirmation of payment', () => {
    expect(royaltyPayoutEvidenceSchema.parse(payout).status).toBe(
      'provider_reported'
    );
    expect(
      royaltyPayoutEvidenceSchema.safeParse({
        ...payout,
        status: 'bank_confirmed',
      }).success
    ).toBe(false);
    expect(
      royaltyPayoutEvidenceSchema.safeParse({
        ...payout,
        status: 'bank_confirmed',
        paidOn: '2026-04-01',
        periods: {
          ...periods,
          payment: { start: '2026-04-01', end: '2026-04-01' },
        },
        confirmationEvidenceRef: 'bank-receipt-1',
      }).success
    ).toBe(true);
  });
});
