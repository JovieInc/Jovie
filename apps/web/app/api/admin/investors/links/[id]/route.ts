import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/investors/links/[id]
 * Update an investor link (stage, notes, active status, etc.).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

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
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if ('expiresAt' in body) {
    if (body.expiresAt === null) {
      updates.expiresAt = null;
    } else if (typeof body.expiresAt === 'string') {
      const expiresAt = new Date(body.expiresAt);
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
  const authError = await requireAdmin();
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
