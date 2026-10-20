import { describe, expect, it } from 'vitest';
import {
  FINANCE_SENSITIVE_FIELDS,
  redactFinancialFields,
} from '@/lib/finance/redaction';

describe('redactFinancialFields', () => {
  it('redacts sensitive fields at any depth', () => {
    const payload = {
      accountId: 'acc_1',
      merchantName: 'Secret Merchant',
      nested: {
        amount: '42.00',
        description: 'coffee',
        safe: 'keep-me',
      },
      list: [{ providerAccountId: 'pa_1' }],
    };
    const out = redactFinancialFields(payload);
    expect(out.merchantName).toBe('[redacted]');
    expect(out.nested.amount).toBe('[redacted]');
    expect(out.nested.description).toBe('[redacted]');
    expect(out.nested.safe).toBe('keep-me');
    expect(out.list[0].providerAccountId).toBe('[redacted]');
    expect(out.accountId).toBe('acc_1');
  });

  it('preserves arrays and returns a structurally equal copy', () => {
    const payload = {
      list: [{ amount: 1, id: 'a' }, 'plain', [{ fileRef: 'f' }]],
      meta: { count: 2, empty: null },
    };
    const out = redactFinancialFields(payload);
    expect(Array.isArray(out.list)).toBe(true);
    expect(out).toEqual({
      list: [
        { amount: '[redacted]', id: 'a' },
        'plain',
        [{ fileRef: '[redacted]' }],
      ],
      meta: { count: 2, empty: null },
    });
    expect(out).not.toBe(payload);
    expect(payload.list[0]).toEqual({ amount: 1, id: 'a' });
  });

  it('redacts every listed sensitive field', () => {
    const payload = Object.fromEntries(
      FINANCE_SENSITIVE_FIELDS.map(field => [field, 'secret'])
    );
    const out = redactFinancialFields({ ...payload, keep: 'ok' });
    for (const field of FINANCE_SENSITIVE_FIELDS) {
      expect(out[field]).toBe('[redacted]');
    }
    expect(out.keep).toBe('ok');
  });

  it('redacts top-level arrays of records', () => {
    expect(redactFinancialFields([{ balance: 5 }, { name: 'x' }])).toEqual([
      { balance: '[redacted]' },
      { name: 'x' },
    ]);
  });

  it('covers balances, identifiers, merchants, and provider payloads', () => {
    for (const field of [
      'currentBalance',
      'availableBalance',
      'merchant_name',
      'provider_account_id',
      'provider_item_id',
      'provider_transaction_id',
    ]) {
      expect(FINANCE_SENSITIVE_FIELDS).toContain(field);
    }
  });

  it('passes through non-object input', () => {
    expect(redactFinancialFields('ok')).toBe('ok');
    expect(redactFinancialFields(null)).toBeNull();
    expect(redactFinancialFields(42)).toBe(42);
    expect(redactFinancialFields(undefined)).toBeUndefined();
  });
});
