import { readFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';
import { remark } from 'remark';
import html from 'remark-html';
import { captureError } from '@/lib/error-tracking';

/**
 * Creates a legal document route handler that converts markdown to HTML
 * @param docFilename - The markdown filename in content/legal/ (e.g., 'terms.md')
 * @param errorMessage - Custom error message if document fails to load
 * @returns Next.js route handler function
 */
export function createLegalDocumentRoute(
  docFilename: string,
  errorMessage: string = 'Failed to load document.'
) {
  return async function GET() {
    try {
      const filePath = path.join(
        process.cwd(),
        'content',
        'legal',
        docFilename
      );
      const fileContents = await readFile(filePath, 'utf8');

      const processedContent = await remark().use(html).process(fileContents);
      const contentHtml = processedContent.toString();

      return new NextResponse(contentHtml, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      });
    } catch (error) {
      captureError(`Error loading legal document: ${docFilename}`, error);
      return new NextResponse(`<p>${errorMessage}</p>`, {
        status: 500,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
  };
}
