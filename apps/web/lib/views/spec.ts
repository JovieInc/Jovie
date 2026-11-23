import { z } from 'zod';

/** Max serialized size of a view spec (enforced by the publish service). */
export const VIEW_SPEC_MAX_BYTES = 512 * 1024;

const statBlockSchema = z
  .object({
    type: z.literal('stat'),
    label: z.string().min(1).max(60),
    value: z.string().min(1).max(40),
    hint: z.string().max(80).optional(),
  })
  .strict();

const sparklineBlockSchema = z
  .object({
    type: z.literal('sparkline'),
    label: z.string().min(1).max(60),
    points: z.array(z.number().finite()).min(2).max(365),
    polarity: z.enum(['higher-is-better', 'lower-is-better']).optional(),
  })
  .strict();

const tableColumnSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_]+$/i),
    label: z.string().min(1).max(60),
  })
  .strict();

const tableBlockSchema = z
  .object({
    type: z.literal('table'),
    columns: z.array(tableColumnSchema).min(1).max(12),
    rows: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
      .max(500),
  })
  .strict();

const textBlockSchema = z
  .object({
    type: z.literal('text'),
    /** Plain text. Rendered as text, never HTML. */
    body: z.string().min(1).max(4000),
  })
  .strict();

const htmlBlockSchema = z
  .object({
    type: z.literal('html'),
    /** Rendered only inside `<iframe sandbox="" srcDoc>`. */
    html: z.string().min(1).max(200_000),
    height: z.number().int().min(120).max(2000).optional(),
  })
  .strict();

export const viewBlockSchema = z.discriminatedUnion('type', [
  statBlockSchema,
  sparklineBlockSchema,
  tableBlockSchema,
  textBlockSchema,
  htmlBlockSchema,
]);

export const viewSpecSchema = z
  .object({
    schema: z.literal('jovie.view.v1'),
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    blocks: z.array(viewBlockSchema).min(1).max(40),
  })
  .strict();

export type ViewSpec = z.infer<typeof viewSpecSchema>;
export type ViewBlock = z.infer<typeof viewBlockSchema>;
