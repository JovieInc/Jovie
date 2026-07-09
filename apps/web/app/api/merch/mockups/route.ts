import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { generateProductMockups } from '@/lib/merch/mockups';

const MOCKUP_PRODUCT_TYPES = ['premium tee', 'premium hoodie', 'mug'] as const;

const postBodySchema = z.object({
  printFileUrl: z.string().url(),
  productTypes: z
    .array(z.enum(MOCKUP_PRODUCT_TYPES))
    .optional()
    .default([...MOCKUP_PRODUCT_TYPES]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { results, errors } = await generateProductMockups({
    printFileUrl: parsed.data.printFileUrl,
    productTypes: parsed.data.productTypes,
  });

  return NextResponse.json({
    success: errors.length === 0,
    mockups: results.map(r => ({
      productType: r.productType,
      productName: r.productName,
      catalogProductId: r.catalogProductId,
      mockupUrls: r.mockupUrls,
    })),
    errors,
  });
}
