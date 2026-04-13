import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from '../../scripts/run-sql';

describe('splitSqlStatements', () => {
  it('uses statement breakpoints for drizzle-style SQL files', () => {
    const sql = `
CREATE OR REPLACE FUNCTION public.bump_counter()
RETURNS void AS $$
BEGIN
  INSERT INTO logs(message) VALUES ('a');
  INSERT INTO logs(message) VALUES ('b');
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "next_task_number" integer;
`;

    expect(splitSqlStatements(sql)).toEqual([
      `CREATE OR REPLACE FUNCTION public.bump_counter()
RETURNS void AS $$
BEGIN
  INSERT INTO logs(message) VALUES ('a');
  INSERT INTO logs(message) VALUES ('b');
END;
$$ LANGUAGE plpgsql;`,
      'ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "next_task_number" integer;',
    ]);
  });

  it('splits raw SQL files on top-level semicolons only', () => {
    const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE example (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  note text DEFAULT 'hello;world'
);

CREATE OR REPLACE FUNCTION public.bump_counter()
RETURNS void AS $$
BEGIN
  INSERT INTO logs(message) VALUES ('a');
  INSERT INTO logs(message) VALUES ('b');
END;
$$ LANGUAGE plpgsql;
`;

    expect(splitSqlStatements(sql)).toEqual([
      'CREATE EXTENSION IF NOT EXISTS pgcrypto',
      `CREATE TABLE example (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  note text DEFAULT 'hello;world'
)`,
      `CREATE OR REPLACE FUNCTION public.bump_counter()
RETURNS void AS $$
BEGIN
  INSERT INTO logs(message) VALUES ('a');
  INSERT INTO logs(message) VALUES ('b');
END;
$$ LANGUAGE plpgsql`,
    ]);
  });
});
