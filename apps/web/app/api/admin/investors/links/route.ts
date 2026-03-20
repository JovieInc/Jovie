import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';

/** Generate a URL-safe random token (21 chars, similar to nanoid) */
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 21);
}

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
  const authError = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { label, investorName, email } = body;

  if (!label || typeof label !== 'string') {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  }

  const token = generateToken();

  const [link] = await db
    .insert(investorLinks)
    .values({
      token,
      label: label.trim(),
      investorName: investorName?.trim() || null,
      email: email?.trim() || null,
    })
    .returning();

  return NextResponse.json({ link }, { status: 201 });
}
