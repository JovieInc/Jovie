import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL?.trim();

async function main() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = neon(databaseUrl);
  const rows = await sql`SELECT 1 as ok`;

  if (!rows?.[0]?.ok) {
    throw new Error('Neon connectivity probe returned an unexpected response');
  }

  console.log('Neon DB connectivity OK');
}

void main().catch(error => {
  console.error('Neon DB connectivity failed:', error);
  process.exit(1);
});
