const TABLE_NAME = Symbol.for('drizzle:Name');

type Chunk = {
  name?: string;
  table?: { [TABLE_NAME]?: string };
  queryChunks?: unknown[];
  value?: unknown;
};

/** Column ids referenced by a Drizzle predicate, as `table.column`. */
export function drizzleColumns(node: unknown): string[] {
  const names: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const chunk = value as Chunk;
    const table = chunk.table?.[TABLE_NAME];
    if (typeof chunk.name === 'string' && table) {
      names.push(`${table}.${chunk.name}`);
    }
    if (chunk.queryChunks) visit(chunk.queryChunks);
    if (Array.isArray(chunk.value)) visit(chunk.value);
  };
  visit(node);
  return names;
}
