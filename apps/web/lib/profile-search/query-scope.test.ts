import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { buildClaimDueQuerySql } from './query-scope';

const scope = {
  creatorProfileId: '11111111-1111-4111-8111-111111111111',
  queryId: '22222222-2222-4222-8222-222222222222',
  queryText: 'Tim White',
  market: 'US',
};
const dialect = new PgDialect();

describe('scoped profile search claims', () => {
  it('binds the exact artist, query and request within the locked candidate selection', () => {
    const compiled = dialect.sqlToQuery(buildClaimDueQuerySql(scope));
    const candidate = compiled.sql.split('FOR UPDATE SKIP LOCKED')[0];
    expect(candidate).toContain('creator_profile_id = $2::uuid');
    expect(candidate).toContain('id = $3::uuid');
    expect(candidate).toContain('query_text = $4');
    expect(candidate).toContain('market = $5');
    expect(candidate).toContain("locale = 'en'");
    expect(candidate).toContain("device = 'desktop'");
    expect(candidate).toContain('enabled = true');
    expect(candidate).toContain('next_run_at <= now()');
    expect(candidate).toContain('lease_expires_at < now()');
    expect(compiled.sql).toContain('WHERE query.id = candidate.id');
    expect(compiled.params).toEqual([
      'google_serpapi',
      scope.creatorProfileId,
      scope.queryId,
      'Tim White',
      'US',
      120,
    ]);
  });

  it('preserves the scheduled batch claim when no scope is supplied', () => {
    const compiled = dialect.sqlToQuery(buildClaimDueQuerySql());
    expect(compiled.params).toEqual(['google_serpapi', 120]);
    expect(compiled.sql).not.toContain('creator_profile_id =');
    expect(compiled.sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('rejects incomplete or invalid operator scope instead of falling back to a global claim', () => {
    for (const invalid of [
      null,
      {},
      { ...scope, creatorProfileId: '' },
      { ...scope, queryId: undefined },
      { ...scope, market: 'us' },
      { ...scope, queryText: '' },
      { ...scope, queryId: "x' OR true --" },
    ]) {
      expect(() => buildClaimDueQuerySql(invalid as typeof scope)).toThrow();
    }
  });

  it('keeps artist names as bound data', () => {
    const name = "Artist' OR true --";
    const compiled = dialect.sqlToQuery(
      buildClaimDueQuerySql({ ...scope, queryText: name })
    );
    expect(compiled.sql).not.toContain(name);
    expect(compiled.params).toContain(name);
  });
});
