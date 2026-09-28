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
  });
});
