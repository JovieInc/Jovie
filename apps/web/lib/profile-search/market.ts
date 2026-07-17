/** Resolve a trailing ISO alpha-2 token; US state-style locations map to US. */
export function resolveProfileSearchMarket(location: string | null) {
  const tokens =
    location
      ?.toUpperCase()
      .split(/[,\s]+/)
      .filter(Boolean) ?? [];
  const country = [...tokens].reverse().find(token => /^[A-Z]{2}$/.test(token));
  if (
    country &&
    location?.includes(',') &&
    US_STATE_CODES.has(country) &&
    tokens.at(-1) === country
  ) {
    return 'US';
  }
  return country ?? 'US';
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
