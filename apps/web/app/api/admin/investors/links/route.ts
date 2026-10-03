import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';
import {
  generateInvestorClaimToken,
  investorClaimExpiresAt,
} from '@/lib/investors/claim-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/investors/links
 * List all investor links with view counts.
 */
export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const links = await db
    .select()
    .from(investorLinks)
    .orderBy(desc(investorLinks.createdAt));

  return NextResponse.json({ links });
}

/**
 * POST /api/admin/investors/links
 * Create a new investor link.
 * Body: { label, investorName?, email? }
 */
export async function POST(request: Request) {
  const authError = await requireAdmin({ session: 'fresh' });
  if (authError) return authError;

  const body = await request.json();
  const { label, investorName, email } = body;
  const trimmedLabel = typeof label === 'string' ? label.trim() : '';

  if (!trimmedLabel) {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  }

  const token = generateInvestorClaimToken();

  const [link] = await db
    .insert(investorLinks)
    .values({
      token,
      label: trimmedLabel,
      investorName: investorName?.trim() || null,
      email: email?.trim() || null,
      expiresAt: investorClaimExpiresAt(),
    })
    .returning();

  return NextResponse.json({ link }, { status: 201 });
}
