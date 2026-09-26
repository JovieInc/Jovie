/**
 * Finance telemetry redaction (JOV-4609).
 *
 * Transaction descriptions, balances, account identifiers, merchant details,
 * and provider payloads must never reach logs, error traces, analytics
 * payloads, or support tooling. Apply `redactFinancialFields` before handing
 * any finance-adjacent object to telemetry.
 */

const REDACTED = '[redacted]' as const;

/** Field names that are always stripped from telemetry payloads. */
export const FINANCE_SENSITIVE_FIELDS = [
  'currentBalance',
  'availableBalance',
  'balance',
  'amount',
  'merchantName',
  'merchant_name',
  'description',
  'providerAccountId',
  'provider_account_id',
  'providerItemId',
  'provider_item_id',
  'providerTransactionId',
  'provider_transaction_id',
  'accountName',
  'accountMask',
  'fileRef',
  'file_ref',
] as const;

const SENSITIVE_SET: ReadonlySet<string> = new Set(FINANCE_SENSITIVE_FIELDS);

/**
 * Return a copy of `payload` with sensitive finance fields replaced by
 * `[redacted]`. Nested objects and arrays are walked; non-object input is
 * returned unchanged.
 */
export function redactFinancialFields<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map(item => redactFinancialFields(item)) as T;
  }
  if (payload !== null && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      out[key] = SENSITIVE_SET.has(key)
        ? REDACTED
        : redactFinancialFields(value);
    }
    return out as T;
  }
  return payload;
}
