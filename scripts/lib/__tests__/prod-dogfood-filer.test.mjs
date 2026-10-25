import { describe, expect, it } from 'vitest';
import {
  DEFECT_ROWS_QUERY,
  exitCodeFor,
  linearDefectRows,
  linearFailureReason,
  OPEN_ISSUES_QUERY,
  openDogfoodIssues,
} from '../../prod-dogfood.mjs';

// Variable types Linear's schema requires for the comparator fields the filer uses.
// IDComparator.eq takes ID (String! is rejected with HTTP 400); createdAt uses
// DateTimeComparator, which takes DateTimeOrDuration.
const SCHEMA_VARIABLE_TYPES = {
  'id.eq': 'ID',
  'createdAt.gte': 'DateTimeOrDuration',
};

function declaredVariables(query) {
  const head = /query\(([^)]*)\)/.exec(query)?.[1] ?? '';
  return Object.fromEntries(
    [...head.matchAll(/\$(\w+):([\w[\]!]+)/g)].map(m => [m[1], m[2]])
  );
}

function comparatorUses(query) {
  return [...query.matchAll(/(\w+):\{(\w+):\$(\w+)\}/g)].map(m => ({
    field: `${m[1]}.${m[2]}`,
    variable: m[3],
  }));
}

describe('Linear filer queries match the schema variable types', () => {
  for (const [name, query] of Object.entries({
    DEFECT_ROWS_QUERY,
    OPEN_ISSUES_QUERY,
  })) {
    it(`${name} declares schema-correct variable types`, () => {
      const declared = declaredVariables(query);
      const uses = comparatorUses(query);
      expect(uses.length).toBeGreaterThan(0);
      for (const { field, variable } of uses) {
        const want = SCHEMA_VARIABLE_TYPES[field];
        expect(
          want,
          `unknown comparator ${field}: add it to the schema table`
        ).toBeDefined();
        expect(declared[variable], `$${variable} used as ${field}`).toBe(
          `${want}!`
        );
      }
    });
  }
});

describe('filer failures are loud', () => {
  const http400 = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      errors: [
        {
          message:
            'Variable "$team" of type "String!" used in position expecting type "ID"',
        },
      ],
    }),
    text: async () => '{"errors":[{"message":"bad type"}]}',
  });

  it('surfaces the HTTP 400 and the GraphQL message instead of returning empty rows', async () => {
    const rows = await linearDefectRows({ apiKey: 'k', fetchImpl: http400 });
    expect(rows.ok).toBe(false);
    expect(rows.reason).toMatch(/400/);
    const open = await openDogfoodIssues({ apiKey: 'k', fetchImpl: http400 });
    expect(open.ok).toBe(false);
  });

  it('includes the GraphQL error text in the reason', () => {
    expect(
      linearFailureReason({
        status: 400,
        data: { errors: [{ message: 'expecting type ID' }] },
      })
    ).toBe('status 400: expecting type ID');
  });

  it('exits 3 when the filer failed, even with no defects, and 2 only for filed defects', () => {
    expect(exitCodeFor({ findings: 0, filerFailures: ['x'] })).toBe(3);
    expect(exitCodeFor({ findings: 2, filerFailures: ['x'] })).toBe(3);
    expect(exitCodeFor({ findings: 2, filerFailures: [] })).toBe(2);
    expect(exitCodeFor({ findings: 0, filerFailures: [] })).toBe(0);
  });
});
