#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local', override: true });
config();

const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

function readDollarQuoteTag(sqlText: string, startIndex: number) {
  if (sqlText[startIndex] !== '$') {
    return null;
  }

  let endIndex = startIndex + 1;
  while (
    endIndex < sqlText.length &&
    /[A-Za-z0-9_]/.test(sqlText[endIndex] ?? '')
  ) {
    endIndex += 1;
  }

  if (sqlText[endIndex] !== '$') {
    return null;
  }

  return sqlText.slice(startIndex, endIndex + 1);
}

export function splitSqlStatements(sqlText: string): string[] {
  if (sqlText.includes(STATEMENT_BREAKPOINT)) {
    return sqlText
      .split(STATEMENT_BREAKPOINT)
      .map(statement => statement.trim())
      .filter(Boolean);
  }

  const statements: string[] = [];
  let statementStart = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag: string | null = null;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index] ?? '';
    const nextChar = sqlText[index + 1] ?? '';

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (dollarQuoteTag) {
      if (sqlText.startsWith(dollarQuoteTag, index)) {
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && nextChar === "'") {
        index += 1;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"' && nextChar === '"') {
        index += 1;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === '$') {
      const maybeDollarQuoteTag = readDollarQuoteTag(sqlText, index);
      if (maybeDollarQuoteTag) {
        dollarQuoteTag = maybeDollarQuoteTag;
        index += maybeDollarQuoteTag.length - 1;
        continue;
      }
    }

    if (char === ';') {
      const statement = sqlText.slice(statementStart, index).trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      statementStart = index + 1;
    }
  }

  const trailingStatement = sqlText.slice(statementStart).trim();
  if (trailingStatement.length > 0) {
    statements.push(trailingStatement);
  }

  return statements;
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: tsx scripts/run-sql.ts <path-to-sql>');
    process.exit(1);
  }

  const absPath = path.isAbsolute(fileArg)
    ? fileArg
    : path.join(process.cwd(), fileArg);

  const sqlText = readFileSync(absPath, 'utf8');
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in environment');
    process.exit(1);
  }

  // Clean Neon URL to standard Postgres URL
  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');

  const sql = neon(databaseUrl);
  const statements = splitSqlStatements(sqlText);

  try {
    console.log(`[SQL] Applying file: ${absPath}`);
    for (const statement of statements) {
      await sql.query(statement);
    }
    console.log('[SQL] Success');
  } catch (err) {
    console.error('[SQL] Error applying file:', err);
    process.exit(1);
  }
  // Neon HTTP driver has no persistent connection - no cleanup needed
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}
