import fs from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';
import { remark } from 'remark';
import html from 'remark-html';

// API routes should be dynamic
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'privacy.md');
    const fileContents = fs.readFileSync(filePath, 'utf8');

    const processedContent = await remark().use(html).process(fileContents);
    const contentHtml = processedContent.toString();

    return new NextResponse(contentHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error loading privacy:', error);
    return new NextResponse('<p>Failed to load privacy policy.</p>', {
      status: 500,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
}
