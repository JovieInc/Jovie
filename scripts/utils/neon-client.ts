import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

type SchemaShape = Record<string, unknown>;

export type NeonClient<TSchema extends SchemaShape = Record<string, never>> = {
  db: NeonDatabase<TSchema>;
  pool: Pool;
};

export function createNeonClient<
  TSchema extends SchemaShape = Record<string, never>,
>(
  databaseUrl: string,
  options: { schema?: TSchema } = {}
): NeonClient<TSchema> {
  neonConfig.webSocketConstructor = ws;
  neonConfig.fetchConnectionCache = true;

  const pool = new Pool({ connectionString: databaseUrl });
  const db = options.schema
    ? drizzle(pool, { schema: options.schema })
    : drizzle(pool);

  return { db: db as NeonDatabase<TSchema>, pool };
}
