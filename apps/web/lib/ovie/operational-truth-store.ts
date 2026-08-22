import 'server-only';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import {
  classifyProjectionSuccessor,
  type OvieShippingProjection,
  ovieShippingProjectionSchema,
  type ProjectionWriteResult,
} from './operational-truth';
export const OVIE_SHIPPING_STATE_KEY = 'ovie:shipping-state:v1:current';
export async function readOperationalTruth(): Promise<unknown | null> {
  const rows = await db
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, OVIE_SHIPPING_STATE_KEY))
    .limit(1);
  return rows[0]?.value ?? null;
}
export type StoreProjectionReceipt = {
  readonly result: ProjectionWriteResult;
  readonly current: OvieShippingProjection | null;
};
export async function storeOperationalTruth(
  candidate: unknown
): Promise<StoreProjectionReceipt> {
  const projection = ovieShippingProjectionSchema.parse(candidate);
  const before = await readOperationalTruth();
  const parsedBefore = ovieShippingProjectionSchema.safeParse(before);
  const current = parsedBefore.success ? parsedBefore.data : null;
  if (before !== null && !parsedBefore.success) {
    return { result: 'conflict', current: null };
  }
  const disposition = classifyProjectionSuccessor(current, projection);
  if (disposition !== 'accepted') {
    return { result: disposition, current };
  }
  const now = new Date();
  const written = await db
    .insert(ovieOperatingKv)
    .values({
      key: OVIE_SHIPPING_STATE_KEY,
      value: projection,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ovieOperatingKv.key,
      set: { value: projection, updatedAt: now },
      setWhere: drizzleSql`
        ${ovieOperatingKv.value} ->> 'projectionId' = ${projection.previousProjectionId}
        AND ((${ovieOperatingKv.value} ->> 'sequence')::bigint + 1) = ${projection.sequence}
      `,
    })
    .returning({ value: ovieOperatingKv.value });
  if (written[0]) {
    return { result: 'accepted', current: projection };
  }
  const parsedCurrent = ovieShippingProjectionSchema.safeParse(
    await readOperationalTruth()
  );
  if (!parsedCurrent.success) {
    return { result: 'conflict', current: null };
  }
  return {
    result: classifyProjectionSuccessor(parsedCurrent.data, projection),
    current: parsedCurrent.data,
  };
}
