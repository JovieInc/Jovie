import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL?.trim();
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = neon(databaseUrl);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const rows = await sql`SELECT 1 as ok`;

      if (!rows?.[0]?.ok) {
        throw new Error(
          'Neon connectivity probe returned an unexpected response'
        );
      }

      console.log('Neon DB connectivity OK');
      return;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Neon connectivity attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS}ms...`
        );
        await sleep(RETRY_DELAY_MS);
      } else {
        throw error;
      }
    }
  }
}

void main().catch(error => {
  console.error('Neon DB connectivity failed:', error);
  process.exit(1);
});
