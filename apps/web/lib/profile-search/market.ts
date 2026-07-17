/** Resolve a trailing ISO alpha-2 token; US state-style locations map to US. */
export function resolveProfileSearchMarket(location: string | null) {
  const normalized = location?.trim().toUpperCase();
  if (!normalized) return 'US';

  const commaParts = normalized
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const trailingPart = commaParts.at(-1) ?? normalized;

  if (trailingPart === 'USA' || trailingPart === 'UNITED STATES') return 'US';
  if (/^[A-Z]{2}$/.test(trailingPart)) {
    return US_STATE_CODES.has(trailingPart) && commaParts.length >= 2
      ? 'US'
      : trailingPart;
  }

  const trailingToken = normalized.split(/\s+/).at(-1);
  return trailingToken && /^[A-Z]{2}$/.test(trailingToken)
    ? trailingToken
    : 'US';
}

const US_STATE_CODES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DC',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
]);
