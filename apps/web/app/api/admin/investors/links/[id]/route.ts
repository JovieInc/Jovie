import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { db } from '@/lib/db';
import { investorLinks, investorStageEnum } from '@/lib/db/schema/investors';

export const runtime = 'nodejs';

/** Schema for the update-investor-link request body. */
const updateInvestorLinkSchema = z.object({
  label: z.string().optional(),
  investorName: z.string().nullish(),
  email: z.string().nullish(),
  stage: z.enum(investorStageEnum.enumValues).optional(),
  notes: z.string().nullish(),
  isActive: z.boolean().optional(),
  expiresAt: z.unknown().optional(),
});

/**
 * PATCH /api/admin/investors/links/[id]
 * Update an investor link (stage, notes, active status, etc.).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin({ session: 'fresh' });
  if (authError) return authError;

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const parsed = updateInvestorLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const allowedFields = [
    'label',
    'investorName',
    'email',
    'stage',
    'notes',
    'isActive',
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of allowedFields) {
    if (field in parsed.data) {
      updates[field] = parsed.data[field];
    }
  }

  if ('expiresAt' in parsed.data) {
    if (parsed.data.expiresAt === null) {
      return NextResponse.json(
        { error: 'Claim links must expire' },
        { status: 400 }
      );
    } else if (typeof parsed.data.expiresAt === 'string') {
      const expiresAt = new Date(parsed.data.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        return NextResponse.json(
          { error: 'expiresAt must be a valid date' },
          { status: 400 }
        );
      }
      updates.expiresAt = expiresAt;
    } else {
      return NextResponse.json(
        { error: 'expiresAt must be a valid date' },
        { status: 400 }
      );
    }
  }

  const [updated] = await db
    .update(investorLinks)
    .set(updates)
    .where(eq(investorLinks.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  return NextResponse.json({ link: updated });
}

/**
 * DELETE /api/admin/investors/links/[id]
 * Deactivate (soft-delete) an investor link.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin({ session: 'fresh' });
  if (authError) return authError;

  const { id } = await params;

  const [updated] = await db
    .update(investorLinks)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(investorLinks.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  return NextResponse.json({ link: updated });
}
