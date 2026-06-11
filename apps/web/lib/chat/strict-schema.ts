import { z } from 'zod';

/**
 * Chat tool inputs reject unknown keys (defense-in-depth against prompt injection
 * and schema drift). Use this instead of bare `z.object()` for every chat
 * tool `inputSchema`.
 */
export function chatToolSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

function unwrapZodObject(
  schema: z.ZodTypeAny
): z.ZodObject<z.ZodRawShape> | null {
  if (schema instanceof z.ZodObject) {
    return schema;
  }
  if (schema instanceof z.ZodEffects) {
    return unwrapZodObject(schema._def.schema);
  }
  return null;
}

/** Returns true when the schema rejects unknown object keys. */
export function isStrictZodObject(schema: z.ZodTypeAny): boolean {
  const objectSchema = unwrapZodObject(schema);
  if (!objectSchema) {
    return false;
  }

  const result = objectSchema.safeParse({ __unexpectedKey: 'x' });
  if (!result.success) {
    return result.error.issues.some(
      issue => issue.code === 'unrecognized_keys'
    );
  }
  return false;
}
